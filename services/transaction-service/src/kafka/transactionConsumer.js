// =============================================================================
// FILE: services/transaction-service/src/kafka/transactionConsumer.js
// PURPOSE: Consume payment events from Kafka and record transactions
//
// BEFORE KAFKA (tight coupling):
//   payment-service → HTTP POST → transaction-service
//   Problem: if transaction-service is down, payment recording is lost
//
// AFTER KAFKA (loose coupling):
//   payment-service → publishes to Kafka → returns success to user
//   transaction-service → reads from Kafka when ready → records transaction
//   Benefit: payment-service does not care if transaction-service is slow
//            Events are never lost even if transaction-service restarts
//
// THIS IS HOW STRIPE, RAZORPAY, AND PHONEPE WORK INTERNALLY
// =============================================================================

const { createConsumer } = require('../../infrastructure/kafka/kafkaClient');
const { TOPICS, PAYMENT_EVENTS, CONSUMER_GROUPS } = require('../../infrastructure/kafka/topics');
const { query } = require('../utils/db');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

let consumer = null;

// Event handlers — called when a Kafka message arrives
const handlers = {

  // Handle payment.completed → record successful transaction
  [PAYMENT_EVENTS.COMPLETED]: async (data) => {
    try {
      const txId = uuidv4();
      await query(
        `INSERT INTO transactions
          (id, payment_id, from_account_id, to_account_id, amount, currency, type, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (payment_id) DO NOTHING`,  // Idempotent — safe to retry
        [txId, data.paymentId, data.fromAccountId, data.toAccountId,
         data.amount, data.currency, 'payment', 'completed']
      );
      logger.info({
        message: 'Kafka: transaction recorded from payment.completed event',
        transactionId: txId,
        paymentId: data.paymentId,
      });
    } catch (err) {
      logger.error({ message: 'Failed to record transaction from Kafka', error: err.message, paymentId: data.paymentId });
      throw err; // Re-throw so Kafka retries this message
    }
  },

  // Handle payment.failed → record failed transaction for audit
  [PAYMENT_EVENTS.FAILED]: async (data) => {
    try {
      const txId = uuidv4();
      await query(
        `INSERT INTO transactions
          (id, payment_id, from_account_id, to_account_id, amount, currency, type, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (payment_id) DO NOTHING`,
        [txId, data.paymentId, data.fromAccountId || 'unknown',
         data.toAccountId || 'unknown', data.amount || 0,
         data.currency || 'INR', 'payment', 'failed']
      );
      logger.info({ message: 'Kafka: failed transaction recorded', paymentId: data.paymentId });
    } catch (err) {
      logger.error({ message: 'Failed to record failed transaction', error: err.message });
    }
  },

  // Handle payment.refunded → record refund transaction
  [PAYMENT_EVENTS.REFUNDED]: async (data) => {
    try {
      const txId = uuidv4();
      await query(
        `INSERT INTO transactions
          (id, payment_id, from_account_id, to_account_id, amount, currency, type, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
        [txId, data.paymentId, data.toAccountId, data.fromAccountId,
         data.amount, data.currency, 'refund', 'completed']
      );
      logger.info({ message: 'Kafka: refund transaction recorded', paymentId: data.paymentId });
    } catch (err) {
      logger.error({ message: 'Failed to record refund', error: err.message });
      throw err;
    }
  },
};

const startConsumer = async () => {
  try {
    consumer = await createConsumer(
      'transaction-service',
      CONSUMER_GROUPS.TRANSACTION_SERVICE,
      [TOPICS.PAYMENTS],  // Subscribe to payment events
      handlers
    );
    logger.info({ message: 'Kafka consumer started — listening on novapay.payments' });
  } catch (err) {
    logger.error({ message: 'Failed to start Kafka consumer', error: err.message });
    // Retry after 5 seconds — Kafka may not be ready yet
    setTimeout(startConsumer, 5000);
  }
};

const stopConsumer = async () => {
  if (consumer) await consumer.disconnect();
};

module.exports = { startConsumer, stopConsumer };

