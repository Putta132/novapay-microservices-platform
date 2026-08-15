const express = require('express');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const createSchema = Joi.object({
  paymentId: Joi.string().required(),
  fromAccountId: Joi.string().required(),
  toAccountId: Joi.string().required(),
  amount: Joi.number().positive().required(),
  currency: Joi.string().default('INR'),
  type: Joi.string().valid('payment', 'refund', 'deposit', 'withdrawal').required(),
  status: Joi.string().valid('pending', 'completed', 'failed').required()
});

// POST /api/transactions — called internally by payment-service
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = createSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    const txId = uuidv4();
    const result = await query(
      'INSERT INTO transactions (id, payment_id, from_account_id, to_account_id, amount, currency, type, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING *',
      [txId, value.paymentId, value.fromAccountId, value.toAccountId, value.amount, value.currency, value.type, value.status]
    );
    logger.info({ message: 'Transaction recorded', transactionId: txId, type: value.type });
    res.status(201).json({ transaction: result.rows[0] });
  } catch (err) { next(err); }
});

// GET /api/transactions — list user transactions
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;
    const offset = (page - 1) * limit;
    let queryText = 'SELECT t.* FROM transactions t JOIN accounts a ON (t.from_account_id = a.id OR t.to_account_id = a.id) WHERE a.user_id = $1';
    const params = [req.user.userId];
    if (type) { params.push(type); queryText += ` AND t.type = $${params.length}`; }
    if (status) { params.push(status); queryText += ` AND t.status = $${params.length}`; }
    params.push(Number(limit), Number(offset));
    queryText += ` ORDER BY t.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const result = await query(queryText, params);
    res.json({ transactions: result.rows, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

// GET /api/transactions/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT t.* FROM transactions t JOIN accounts a ON (t.from_account_id = a.id OR t.to_account_id = a.id) WHERE t.id = $1 AND a.user_id = $2',
      [req.params.id, req.user.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ transaction: result.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
