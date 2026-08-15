const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { query } = require('../utils/db');
const logger = require('../utils/logger');
const { getUserCache, setUserCache, checkLoginRateLimit, resetLoginAttempts, revokeToken, isRevoked } = require('../redis/authCache');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const registerSchema = Joi.object({ email: Joi.string().email().required(), password: Joi.string().min(8).required(), name: Joi.string().min(2).max(100).required() });
const loginSchema = Joi.object({ email: Joi.string().email().required(), password: Joi.string().required() });

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    const { email, password, name } = value;
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 12);
    const result = await query('INSERT INTO users (email, password_hash, name, created_at) VALUES ($1,$2,$3,NOW()) RETURNING id, email, name', [email, hash, name]);
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    await setUserCache(user.id, user);
    logger.info({ message: 'User registered', userId: user.id });
    res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) { next(err); }
});

// POST /api/auth/login — with Redis rate limiting
router.post('/login', async (req, res, next) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    const { email, password } = value;

    const rateCheck = await checkLoginRateLimit(email);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: 'Too many login attempts. Try again in ' + rateCheck.resetIn + ' seconds.' });
    }

    const result = await query('SELECT id, email, name, password_hash FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    await resetLoginAttempts(email);
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    await setUserCache(user.id, { id: user.id, email: user.email, name: user.name });
    logger.info({ message: 'User logged in', userId: user.id });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) { next(err); }
});

// POST /api/auth/verify — checks Redis blacklist
router.post('/verify', async (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  const token = header.split(' ')[1];
  try {
    const blacklisted = await isRevoked(token);
    if (blacklisted) return res.status(401).json({ valid: false, error: 'Token has been revoked' });
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, userId: decoded.userId, email: decoded.email });
  } catch (err) { res.status(401).json({ valid: false, error: 'Invalid or expired token' }); }
});

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
    const token = jwt.sign({ userId: decoded.userId, email: decoded.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({ token });
  } catch (err) { res.status(401).json({ error: 'Invalid or expired token' }); }
});

// POST /api/auth/logout — blacklists token in Redis
router.post('/logout', async (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const expiry = decoded.exp - Math.floor(Date.now() / 1000);
    await revokeToken(token, Math.max(expiry, 0));
    logger.info({ message: 'User logged out', userId: decoded.userId });
    res.json({ message: 'Logged out successfully' });
  } catch (err) { res.status(401).json({ error: 'Invalid token' }); }
});

module.exports = router;