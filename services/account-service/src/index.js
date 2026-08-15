require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const client = require('prom-client');
const accountRoutes = require('./routes/account');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

const register = new client.Registry();
client.collectDefaultMetrics({ register });
const httpRequestTotal = new client.Counter({ name: 'http_requests_total', help: 'Total HTTP requests', labelNames: ['method', 'route', 'status'], registers: [register] });

app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use((req, res, next) => { res.on('finish', () => httpRequestTotal.inc({ method: req.method, route: req.path, status: res.statusCode })); next(); });

app.get('/health', (_req, res) => res.json({ status: 'healthy', service: 'account-service', timestamp: new Date().toISOString() }));
app.get('/metrics', async (_req, res) => { res.set('Content-Type', register.contentType); res.end(await register.metrics()); });
app.use('/api/accounts', accountRoutes);
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, _next) => { logger.error({ message: err.message }); res.status(err.status || 500).json({ error: err.message || 'Internal server error' }); });

const server = app.listen(PORT, () => logger.info(`account-service listening on port ${PORT}`));
module.exports = { app, server };
