// =============================================================================
// FILE: services/account-service/src/routes/account.js (UPDATED with Redis)
// CHANGES: Redis cache for account list, single account, and balance
// =============================================================================

const express = require('express');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const { getAccountCache, setAccountCache, invalidateAccountCache, getAccountListCache, setAccountListCache, invalidateAccountListCache, getBalanceCache, setBalanceCache } = require('../redis/accountCache');

const router = express.Router();
const accountSchema = Joi.object({ accountType: Joi.string().valid('savings', 'current', 'wallet').required(), currency: Joi.string().default('INR') });

// GET /api/accounts — with Redis cache
router.get('/', authenticate, async (req, res, next) => {
  try {
    // Check cache first
    const cached = await getAccountListCache(req.user.userId);
    if (cached) return res.json({ accounts: cached, cached: true });

    const result = await query('SELECT * FROM accounts WHERE user_id = $1 ORDER BY created_at DESC', [req.user.userId]);
    await setAccountListCache(req.user.userId, result.rows);
    res.json({ accounts: result.rows, cached: false });
  } catch (err) { next(err); }
});

// GET /api/accounts/:id — with Redis cache
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const cached = await getAccountCache(req.params.id);
    if (cached) return res.json({ account: cached, cached: true });

    const result = await query('SELECT * FROM accounts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    await setAccountCache(req.params.id, result.rows[0]);
    res.json({ account: result.rows[0], cached: false });
  } catch (err) { next(err); }
});

// POST /api/accounts — create new account, invalidate list cache
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { error, value } = accountSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    const accountNumber = `NP${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const result = await query(
      'INSERT INTO accounts (id, user_id, account_number, account_type, currency, balance, status, created_at) VALUES ($1,$2,$3,$4,$5,0,$6,NOW()) RETURNING *',
      [uuidv4(), req.user.userId, accountNumber, value.accountType, value.currency || 'INR', 'active']
    );
    // Invalidate list cache so next GET fetches fresh data
    await invalidateAccountListCache(req.user.userId);
    logger.info({ message: 'Account created', userId: req.user.userId, accountId: result.rows[0].id });
    res.status(201).json({ account: result.rows[0] });
  } catch (err) { next(err); }
});

// GET /api/accounts/:id/balance — with Redis cache (30s TTL)
router.get('/:id/balance', authenticate, async (req, res, next) => {
  try {
    const cached = await getBalanceCache(req.params.id);
    if (cached) return res.json({ ...cached, cached: true });

    const result = await query('SELECT id, account_number, balance, currency FROM accounts WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Account not found' });
    const { balance, currency, account_number } = result.rows[0];
    await setBalanceCache(req.params.id, { balance, currency, accountNumber: account_number });
    res.json({ balance, currency, accountNumber: account_number, cached: false });
  } catch (err) { next(err); }
});

module.exports = router;
