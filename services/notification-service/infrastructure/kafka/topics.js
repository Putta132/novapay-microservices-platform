// =============================================================================
// FILE: infrastructure/kafka/topics.js
// PURPOSE: Central definition of all Kafka topics and event schemas
//
// KAFKA CONCEPT:
//   Without Kafka (current):
//     payment-service → directly calls transaction-service (HTTP)
//     If transaction-service is down → payment fails
//
//   With Kafka (new):
//     payment-service → publishes event to Kafka topic
//     transaction-service → reads event from Kafka when it is ready
//     If transaction-service is down → event waits in Kafka
//     No data loss, no tight coupling
//
// TOPICS IN NOVAPAY:
//   novapay.payments        → payment initiated, completed, failed
//   novapay.transactions    → transaction recorded
//   novapay.accounts        → account created, balance updated
//   novapay.notifications   → email/SMS to be sent
//   novapay.audit           → all important actions for compliance
// =============================================================================

const TOPICS = {
  // Payment events
  PAYMENTS: 'novapay.payments',
  // Transaction events
  TRANSACTIONS: 'novapay.transactions',
  // Account events
  ACCOUNTS: 'novapay.accounts',
  // Notification events
  NOTIFICATIONS: 'novapay.notifications',
  // Audit trail (compliance requirement for payment platforms)
  AUDIT: 'novapay.audit',
};

// Event types published to each topic
const PAYMENT_EVENTS = {
  INITIATED: 'payment.initiated',
  COMPLETED: 'payment.completed',
  FAILED: 'payment.failed',
  REFUNDED: 'payment.refunded',
};

const TRANSACTION_EVENTS = {
  RECORDED: 'transaction.recorded',
};

const ACCOUNT_EVENTS = {
  CREATED: 'account.created',
  BALANCE_UPDATED: 'account.balance_updated',
  STATUS_CHANGED: 'account.status_changed',
};

const NOTIFICATION_EVENTS = {
  EMAIL_REQUESTED: 'notification.email_requested',
  SMS_REQUESTED: 'notification.sms_requested',
};

const AUDIT_EVENTS = {
  USER_REGISTERED: 'audit.user_registered',
  USER_LOGGED_IN: 'audit.user_logged_in',
  PAYMENT_ATTEMPTED: 'audit.payment_attempted',
  SECRET_ACCESSED: 'audit.secret_accessed',
};

// Consumer groups — each service has its own group
// Kafka delivers each message to ONE consumer in a group
const CONSUMER_GROUPS = {
  TRANSACTION_SERVICE: 'novapay-transaction-service',
  NOTIFICATION_SERVICE: 'novapay-notification-service',
  AUDIT_SERVICE: 'novapay-audit-service',
};

module.exports = {
  TOPICS,
  PAYMENT_EVENTS,
  TRANSACTION_EVENTS,
  ACCOUNT_EVENTS,
  NOTIFICATION_EVENTS,
  AUDIT_EVENTS,
  CONSUMER_GROUPS,
};
