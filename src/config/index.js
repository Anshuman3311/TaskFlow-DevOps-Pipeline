// Loads variables from a .env file (if present) into process.env, then exposes
// a single validated config object. Everything else in the app should read
// config from here rather than reaching into process.env directly, so all
// environment-specific behaviour lives in one place.
require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

const DEFAULT_JWT_SECRET = 'dev-secret-change-me';
const jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

if (isProduction && jwtSecret === DEFAULT_JWT_SECRET) {
  // Fail loudly rather than silently running production on a known, insecure
  // default secret.
  // eslint-disable-next-line no-console
  console.error(
    'FATAL: JWT_SECRET must be set to a strong, unique value in production.'
  );
  process.exit(1);
}

const config = {
  nodeEnv,
  isProduction,
  isTest,
  port: Number(process.env.PORT) || 3000,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  logLevel: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  appVersion: process.env.npm_package_version || '1.0.0',
};

module.exports = config;
