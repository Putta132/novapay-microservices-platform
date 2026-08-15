require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const client = require('prom-client');
const { createProxyMiddleware } = require('http-proxy-middleware');
const jwt = require('jsonwebtoken');
const logger = require('./utils/logger');
const { generalRateLimit, paymentRateLimit, authRateLimit } = require('./redis/gatewayCache');

const app = express();
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

// Service URLs
const SERVICES = {
  auth:         process.env.AUTH_SERVICE_URL         || 'http://auth-service:3001',
  account:      process.env.ACCOUNT_SERVICE_URL      || 'http://account-service:3000',
  payment:      process.env.PAYMENT_SERVICE_URL      || 'http://payment-service:3004',
  transaction:  process.env.TRANSACTION_SERVICE_URL  || 'http://transaction-service:3005',
  notification: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3003'
};

// ── Prometheus ────────────────────────────────────────────────────────────────
const register = new client.Registry();
client.collectDefaultMetrics({ register });
const httpRequestTotal = new client.Counter({ name: 'http_requests_total', help: 'Total HTTP requests', labelNames: ['method', 'route', 'status'], registers: [register] });
const httpDuration = new client.Histogram({ name: 'http_request_duration_seconds', help: 'HTTP request duration', labelNames: ['method', 'route', 'status'], registers: [register] });

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors());
app.use(helmet());
// Coarse in-memory limit as a first line of defense (per-pod); the real,
// cluster-wide limit enforced across all gateway replicas is the Redis-backed
// generalRateLimit/paymentRateLimit/authRateLimit applied per-route below.
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => { const l = { method: req.method, route: req.path, status: res.statusCode }; end(l); httpRequestTotal.inc(l); });
  next();
});

// ── JWT auth middleware (skip for auth routes) ────────────────────────────────
const requireAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
    req.headers['x-user-id'] = decoded.userId;
    req.headers['x-user-email'] = decoded.email;
    next();
  } catch (err) { res.status(401).json({ error: 'Invalid or expired token' }); }
};

// ── Proxy helper ──────────────────────────────────────────────────────────────
const proxy = (target) => createProxyMiddleware({
  target,
  changeOrigin: true,
  on: {
    error: (err, req, res) => {
      logger.error({ message: 'Proxy error', target, error: err.message });
      res.status(502).json({ error: 'Service temporarily unavailable' });
    }
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'gateway-service', timestamp: new Date().toISOString() }));
app.get('/metrics', async (_req, res) => { res.set('Content-Type', register.contentType); res.end(await register.metrics()); });

// Public — no JWT required, but Redis-backed IP rate limit (20 req/min) applies
// to slow down credential-stuffing / brute-force attempts against login+register
app.use('/api/auth', authRateLimit, proxy(SERVICES.auth));

// Protected — auth required, then route-appropriate Redis rate limit:
// payments get the strict 10 req/min tier, everything else gets 100 req/min
app.use('/api/accounts',      requireAuth, generalRateLimit, proxy(SERVICES.account));
app.use('/api/payments',      requireAuth, paymentRateLimit,  proxy(SERVICES.payment));
app.use('/api/transactions',  requireAuth, generalRateLimit, proxy(SERVICES.transaction));
app.use('/api/notifications', requireAuth, generalRateLimit, proxy(SERVICES.notification));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

const server = app.listen(PORT, () => logger.info(`gateway-service listening on port ${PORT}`));
module.exports = { app, server };

