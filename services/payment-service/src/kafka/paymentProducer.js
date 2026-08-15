// =============================================================================
// FILE: services/payment-service/src/kafka/paymentProducer.js
// PURPOSE: Publishes payment events to Kafka after each payment action
//
// EVENTS PUBLISHED:
//   payment.initiated  → when Razorpay order is created
//   payment.completed  → when signature is verified and money moved
//   payment.failed     → when signature verification fails
//
// CONSUMERS:
//   transaction-service reads payment.completed → records transaction
//   notification-service reads payment.completed → sends email
//   audit-service reads all events → compliance trail
// =============================================================================

const { createProducer } = require('../../infrastructure/kafka/kafkaClient');
const { TOPICS, PAYMENT_EVENTS } = require('../../infrastructure/kafka/topics');
const logger = require('../utils/logger');

let producer = null;

const getProducer = async () => {
  if (!producer) {
    producer = await createProducer('payment-service');
  }
  return producer;
};

// Publish event when a Razorpay order is created
const publishPaymentInitiated = async (paymentData) => {
  try {
    const prod = await getProducer();
    await prod.publish(
      TOPICS.PAYMENTS,
      PAYMENT_EVENTS.INITIATED,
      {
        paymentId:     paymentData.paymentId,
        userId:        paymentData.userId,
        orderId:       paymentData.orderId,
        amount:        paymentData.amount,
        currency:      paymentData.currency,
        fromAccountId: paymentData.fromAccountId,
        toAccountId:   paymentData.toAccountId,
      },
      paymentData.paymentId   // Use paymentId as partition key
    );
    logger.info({ message: 'Kafka: payment.initiated published', paymentId: paymentData.paymentId });
  } catch (err) {
    // Log but DO NOT throw — Kafka failure should not break payment flow
    logger.error({ message: 'Kafka publish failed for payment.initiated', error: err.message });
  }
};

// Publish event when payment is successfully verified and completed
const publishPaymentCompleted = async (paymentData) => {
  try {
    const prod = await getProducer();
    await prod.publish(
      TOPICS.PAYMENTS,
      PAYMENT_EVENTS.COMPLETED,
      {
        paymentId:         paymentData.paymentId,
        userId:            paymentData.userId,
        razorpayPaymentId: paymentData.razorpayPaymentId,
        amount:            paymentData.amount,
        currency:          paymentData.currency,
        fromAccountId:     paymentData.fromAccountId,
        toAccountId:       paymentData.toAccountId,
        completedAt:       new Date().toISOString(),
      },
      paymentData.paymentId
    );
    logger.info({ message: 'Kafka: payment.completed published', paymentId: paymentData.paymentId });
  } catch (err) {
    logger.error({ message: 'Kafka publish failed for payment.completed', error: err.message });
  }
};

// Publish event when payment fails
const publishPaymentFailed = async (paymentData, reason) => {
  try {
    const prod = await getProducer();
    await prod.publish(
      TOPICS.PAYMENTS,
      PAYMENT_EVENTS.FAILED,
      {
        paymentId: paymentData.paymentId,
        userId:    paymentData.userId,
        amount:    paymentData.amount,
        reason,
        failedAt:  new Date().toISOString(),
      },
      paymentData.paymentId
    );
    logger.info({ message: 'Kafka: payment.failed published', paymentId: paymentData.paymentId });
  } catch (err) {
    logger.error({ message: 'Kafka publish failed for payment.failed', error: err.message });
  }
};

const disconnectProducer = async () => {
  if (producer) await producer.disconnect();
};

module.exports = {
  publishPaymentInitiated,
  publishPaymentCompleted,
  publishPaymentFailed,
  disconnectProducer,
};

