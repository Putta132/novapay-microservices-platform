// =============================================================================
// FILE: services/payment-service/src/routes/payment.js (UPDATED with Kafka + Redis)
// CHANGES: Kafka events on every payment action, Redis caching, idempotency keys
// =============================================================================

const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../utils/db');
const { authenticate } = require('../middleware/auth');
const logger = require('../utils/logger');
const { publishPaymentInitiated, publishPaymentCompleted, publishPaymentFailed } = require('../kafka/paymentProducer');
const { getPaymentCache, setPaymentCache, invalidatePaymentCache, invalidateAccountBalanceCache, getIdempotencyResult, setIdempotencyResult } = require('../redis/paymentCache');

const router = express.Router();
const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder', key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret' });
const initiateSchema = Joi.object({ amount: Joi.number().positive().max(1000000).required(), currency: Joi.string().default('INR'), fromAccountId: Joi.string().required(), toAccountId: Joi.string().required(), description: Joi.string().max(255).optional() });

// POST /api/payments/initiate
router.post('/initiate', authenticate, async (req, res, next) => {
  try {
    const { error, value } = initiateSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    const { amount, currency, fromAccountId, toAccountId, description } = value;

    // Idempotency check
    const idempotencyKey = req.headers['x-idempotency-key'];
    if (idempotencyKey) {
      const cached = await getIdempotencyResult(idempotencyKey);
      if (cached) return res.status(201).json({ ...cached, idempotent: true });
    }

    const accountResult = await query('SELECT id, balance, status FROM accounts WHERE id = $1 AND user_id = $2', [fromAccountId, req.user.userId]);
    if (accountResult.rows.length === 0) return res.status(404).json({ error: 'Source account not found' });
    const account = accountResult.rows[0];
    if (account.status !== 'active') return res.status(400).json({ error: 'Account is not active' });
    if (account.balance  {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return res.status(400).json({ error: 'Missing payment verification fields' });

    const expectedSig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret').update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');

    const paymentResult = await query('SELECT * FROM payments WHERE razorpay_order_id = $1', [razorpay_order_id]);
    if (paymentResult.rows.length === 0) return res.status(404).json({ error: 'Payment not found' });
    const payment = paymentResult.rows[0];

    if (expectedSig !== razorpay_signature) {
      await query('UPDATE payments SET status = $1 WHERE razorpay_order_id = $2', ['failed', razorpay_order_id]);
      await publishPaymentFailed(payment, 'Invalid signature');
      await invalidatePaymentCache(payment.id);
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    await query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [payment.amount, payment.from_account_id]);
    await query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [payment.amount, payment.to_account_id]);
    await query('UPDATE payments SET status=$1, razorpay_payment_id=$2, completed_at=NOW() WHERE id=$3', ['completed', razorpay_payment_id, payment.id]);

    await invalidateAccountBalanceCache(payment.from_account_id);
    await invalidateAccountBalanceCache(payment.to_account_id);
    await invalidatePaymentCache(payment.id);

    await publishPaymentCompleted({ paymentId: payment.id, userId: payment.user_id, razorpayPaymentId: razorpay_payment_id, amount: payment.amount, currency: payment.currency, fromAccountId: payment.from_account_id, toAccountId: payment.to_account_id });

    logger.info({ message: 'Payment completed', paymentId: payment.id });
    res.json({ success: true, paymentId: payment.id, amount: payment.amount, currency: payment.currency });
  } catch (err) { next(err); }
});

// GET /api/payments
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;
    let queryText = 'SELECT id, amount, currency, status, description, created_at, completed_at FROM payments WHERE user_id = $1';
    const params = [req.user.userId];
    if (status) { params.push(status); queryText += ` AND status = $${params.length}`; }
    params.push(Number(limit), Number(offset));
    queryText += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const result = await query(queryText, params);
    res.json({ payments: result.rows, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

// GET /api/payments/:id — with Redis cache
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const cached = await getPaymentCache(req.params.id);
    if (cached) return res.json({ payment: cached, cached: true });
    const result = await query('SELECT * FROM payments WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Payment not found' });
    await setPaymentCache(req.params.id, result.rows[0]);
    res.json({ payment: result.rows[0], cached: false });
  } catch (err) { next(err); }
});

module.exports = router;
