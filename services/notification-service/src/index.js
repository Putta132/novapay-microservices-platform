require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const client = require('prom-client');
const notificationRoutes = require('./routes/notification');
const logger = require('./utils/logger');
const { startConsumer, stopConsumer } = require('./kafka/notificationConsumer');

const app = express();
const PORT = process.env.PORT || 3003;

const register = new client.Registry();
client.collectDefaultMetrics({ register });
const httpRequestTotal = new client.Counter({ name: 'http_requests_total', help: 'Total HTTP requests', labelNames: ['method', 'route', 'status'], registers: [register] });
const notificationCounter = new client.Counter({ name: 'notifications_sent_total', help: 'Total notifications sent', labelNames: ['type', 'channel'], registers: [register] });

app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));
app.use((req, res, next) => { res.on('finish', () => httpRequestTotal.inc({ method: req.method, route: req.path, status: res.statusCode })); next(); });
app.set('notificationCounter', notificationCounter);

app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'notification-service', timestamp: new Date().toISOString() }));
app.get('/metrics', async (_req, res) => { res.set('Content-Type', register.contentType); res.end(await register.metrics()); });
app.use('/api/notifications', notificationRoutes);
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, _next) => { logger.error({ message: err.message }); res.status(err.status || 500).json({ error: err.message || 'Internal server error' }); });

const server = app.listen(PORT, () => logger.info(`notification-service listening on port ${PORT}`));

// Start Kafka consumer — listens on novapay.payments + novapay.accounts topics
// to send emails asynchronously (payment success/failure, welcome emails).
// Skipped in test environment (Jest mocks this module instead).
if (process.env.NODE_ENV !== 'test') {
  startConsumer().catch((err) => logger.error({ message: 'Kafka consumer failed to start', error: err.message }));
}

// Graceful shutdown — disconnect Kafka consumer before the process exits
const shutdown = async () => {
  logger.info({ message: 'notification-service shutting down, disconnecting Kafka consumer' });
  await stopConsumer();
  server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { app, server };
