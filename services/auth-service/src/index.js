require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const client = require('prom-client');
const authRoutes = require('./routes/auth');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3001;

const register = new client.Registry();
client.collectDefaultMetrics({ register });
const httpRequestTotal = new client.Counter({ name: 'http_requests_total', help: 'Total HTTP requests', labelNames: ['method', 'route', 'status'], registers: [register] });
const httpDuration = new client.Histogram({ name: 'http_request_duration_seconds', help: 'HTTP request duration', labelNames: ['method', 'route', 'status'], registers: [register] });

app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => { const l = { method: req.method, route: req.path, status: res.statusCode }; end(l); httpRequestTotal.inc(l); });
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'auth-service', timestamp: new Date().toISOString() }));
app.get('/metrics', async (_req, res) => { res.set('Content-Type', register.contentType); res.end(await register.metrics()); });
app.use('/api/auth', authRoutes);
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, _next) => { logger.error({ message: err.message }); res.status(err.status || 500).json({ error: err.message || 'Internal server error' }); });

const server = app.listen(PORT, () => logger.info(`auth-service listening on port ${PORT}`));
module.exports = { app, server };
