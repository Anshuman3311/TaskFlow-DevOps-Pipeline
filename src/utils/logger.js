const config = require('../config');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const activeLevel = LEVELS[config.logLevel] || LEVELS.info;

function write(level, message, meta = {}) {
  if (LEVELS[level] < activeLevel) {return;}

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  // In test runs, keep stdout quiet unless explicitly debugging.
  if (config.isTest && level !== 'error') {return;}

  // Structured, one-line-per-event JSON logs are easy for Jenkins, Datadog,
  // or any log shipper to parse without extra configuration.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}

module.exports = {
  debug: (message, meta) => write('debug', message, meta),
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
};
