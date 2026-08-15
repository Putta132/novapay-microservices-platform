require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const client = require('prom-client');
const paymentRoutes = require('./routes/payment');
const logger = require('./utils/logger');
const { disconnectProducer } = require('./kafka/paymentProducer');

const app = express();
const PORT = process.env.PORT || 3004;

const register = new client.Registry();
client.collectDefaultMetrics({ register });
const httpRequestTotal = new client.Counter({ name: 'http_requests_total', help: 'Total HTTP requests', labelNames: ['method', 'route', 'status'], registers: [register] });
const paymentCounter = new client.Counter({ name: 'payment_transactions_total', help: 'Total payment transactions', labelNames: ['status'], registers: [register] });
const paymentFailed = new client.Counter({ name: 'payment_transactions_failed_total', help: 'Failed payment transactions', registers: [register] });

app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }));
app.use((req, res, next) => { res.on('finish', () => httpRequestTotal.inc({ method: req.method, route: req.path, status: res.statusCode })); next(); });

app.set('paymentCounter', paymentCounter);
app.set('paymentFailed', paymentFailed);

app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'payment-service', timestamp: new Date().toISOString() }));
app.get('/metrics', async (_req, res) => { res.set('Content-Type', register.contentType); res.end(await register.metrics()); });
app.use('/api/payments', paymentRoutes);
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, _next) => { logger.error({ message: err.message }); res.status(err.status || 500).json({ error: err.message || 'Internal server error' }); });

const server = app.listen(PORT, () => logger.info(`payment-service listening on port ${PORT}`));

// Note: the Kafka producer connects lazily on first publish call (see kafka/paymentProducer.js
// getProducer()), so there is no explicit "start" step here — only graceful shutdown is needed.

// Graceful shutdown — disconnect Kafka producer cleanly before the process exits
// so in-flight payment.completed/failed events are flushed, not dropped mid-write.
const shutdown = async () => {
  logger.info({ message: 'payment-service shutting down, disconnecting Kafka producer' });
  await disconnectProducer();
  server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { app, server };
