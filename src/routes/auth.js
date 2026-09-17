const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { isValidEmail, cleanString } = require('../utils/validate');

const router = express.Router();

router.post('/register', (req, res) => {
  const email = cleanString(req.body.email, 254).toLowerCase();
  const { password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'email is not a valid email address' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }

  const existing = db.users.findByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'A user with that email already exists' });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const user = db.users.create({ email, password: hashed });

  const token = jwt.sign({ id: user.id, email: user.email }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

  logger.info('user registered', { userId: user.id });
  return res.status(201).json({ token, user: { id: user.id, email: user.email } });
});

router.post('/login', (req, res) => {
  const email = cleanString(req.body.email, 254).toLowerCase();
  const { password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = db.users.findByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    logger.warn('failed login attempt', { email });
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign({ id: user.id, email: user.email }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

  logger.info('user logged in', { userId: user.id });
  return res.json({ token, user: { id: user.id, email: user.email } });
});

// JWTs are stateless, so there is no server-side session to destroy. This
// endpoint exists so the client has a single, explicit "log out" call to make
// (useful for audit logging, and a natural place to add token revocation /
// a denylist later if the app grows to need it).
router.post('/logout', authenticate, (req, res) => {
  logger.info('user logged out', { userId: req.user.id });
  return res.status(200).json({ message: 'Logged out successfully' });
});

module.exports = router;
