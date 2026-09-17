const path = require('path');
const express = require('express');
const client = require('prom-client');
const config = require('./config');
const logger = require('./utils/logger');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Structured request logging ---
// One JSON line per request: easy for a log shipper, or a human reading
// Jenkins/Docker output, to parse without extra tooling.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
});

// --- Monitoring setup (Prometheus-compatible metrics) ---
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
});
register.registerMetric(httpRequestCounter);

app.use((req, res, next) => {
  res.on('finish', () => {
    httpRequestCounter.inc({
      method: req.method,
      route: req.route ? req.route.path : req.path,
      status: res.statusCode,
    });
  });
  next();
});

// --- Health check endpoint (used by Deploy/Monitoring stages) ---
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    environment: config.nodeEnv,
    version: config.appVersion,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// --- Metrics endpoint for Prometheus / Datadog / New Relic scraping ---
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// --- Application routes ---
app.get('/api', (req, res) => {
  res.json({ message: 'Welcome to the TaskFlow API', version: config.appVersion });
});
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);

// --- 404 handler ---
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// --- Error handler ---
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // express.json() throws a SyntaxError for malformed request bodies -
  // that's a client mistake, not a server failure, so report it as 400.
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Malformed JSON in request body' });
  }

  logger.error('unhandled error', { message: err.message, stack: err.stack });
  return res.status(500).json({ error: 'Internal server error' });
});

// Only start listening if this file is run directly (not when imported by tests)
if (require.main === module) {
  app.listen(config.port, () => {
    logger.info('TaskFlow API started', { port: config.port, environment: config.nodeEnv });
  });
}

module.exports = app;
