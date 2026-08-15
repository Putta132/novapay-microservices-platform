// =============================================================================
// FILE: services/payment-service/src/redis/paymentCache.js
// PURPOSE: Cache payment status and account balances for fast lookups
//
// CACHE STRATEGY:
//   Account balances: cached for 60 seconds
//     → Balance changes on every payment, so short TTL
//     → After debit/credit, cache is invalidated immediately
//
//   Payment status: cached for 5 minutes
//     → Users often refresh "did my payment go through?"
//     → Reduces DB load on the payment table
//
//   Idempotency keys: cached for 24 hours
//     → Prevents duplicate payments if user clicks "Pay" twice
//     → KEY fintech feature — Stripe, Razorpay all use this
// =============================================================================

const {
  cacheGet,
  cacheSet,
  cacheDelete,
} = require('../../infrastructure/redis/redisClient');

const TTL = {
  BALANCE:      60,        // 60 seconds — balance changes frequently
  PAYMENT:      300,       // 5 minutes — payment status
  IDEMPOTENCY:  86400,     // 24 hours — duplicate payment prevention
};

// ─── Account balance cache ────────────────────────────────────────────────────

const getAccountBalanceCache = async (accountId) => {
  return cacheGet(`account:${accountId}:balance`);
};

const setAccountBalanceCache = async (accountId, balance) => {
  await cacheSet(`account:${accountId}:balance`, { balance }, TTL.BALANCE);
};

const invalidateAccountBalanceCache = async (accountId) => {
  await cacheDelete(`account:${accountId}:balance`);
};

// ─── Payment status cache ─────────────────────────────────────────────────────

const getPaymentCache = async (paymentId) => {
  return cacheGet(`payment:${paymentId}`);
};

const setPaymentCache = async (paymentId, paymentData) => {
  await cacheSet(`payment:${paymentId}`, paymentData, TTL.PAYMENT);
};

const invalidatePaymentCache = async (paymentId) => {
  await cacheDelete(`payment:${paymentId}`);
};

// ─── Idempotency key (duplicate payment prevention) ───────────────────────────
// HOW IT WORKS:
//   Client sends: X-Idempotency-Key: "unique-uuid-per-payment-attempt"
//   If we have seen this key before → return cached result immediately
//   If new → process payment → store result with key for 24 hours
//   Prevents double-charging if network times out and user retries

const getIdempotencyResult = async (idempotencyKey) => {
  return cacheGet(`idempotency:${idempotencyKey}`);
};

const setIdempotencyResult = async (idempotencyKey, result) => {
  await cacheSet(`idempotency:${idempotencyKey}`, result, TTL.IDEMPOTENCY);
};

module.exports = {
  getAccountBalanceCache,
  setAccountBalanceCache,
  invalidateAccountBalanceCache,
  getPaymentCache,
  setPaymentCache,
  invalidatePaymentCache,
  getIdempotencyResult,
  setIdempotencyResult,
};

