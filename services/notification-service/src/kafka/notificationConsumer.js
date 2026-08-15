// =============================================================================
// FILE: services/notification-service/src/kafka/notificationConsumer.js
// PURPOSE: Consume payment and account events → send email notifications
//
// EVENTS CONSUMED:
//   payment.completed  → send "Payment Successful" email
//   payment.failed     → send "Payment Failed" email
//   account.created    → send "Welcome / Account Created" email
//   audit.user_registered → send "Welcome to NovaPay" email
// =============================================================================

const { createConsumer } = require('../../infrastructure/kafka/kafkaClient');
const { TOPICS, PAYMENT_EVENTS, ACCOUNT_EVENTS, CONSUMER_GROUPS } = require('../../infrastructure/kafka/topics');
const { query } = require('../utils/db');
const logger = require('../utils/logger');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

// Email templates
const TEMPLATES = {
  payment_success: (data) => ({
    subject: `✅ Payment of ₹${data.amount} successful — NovaPay`,
    html: `
      
        Payment Successful 🎉
        Your payment of ₹${data.amount} ${data.currency} has been processed successfully.
        
          Payment ID: ${data.paymentId}
          Amount: ₹${data.amount}
          Date: ${new Date().toLocaleString('en-IN')}
        
        If you did not make this payment, please contact support immediately.
      
    `,
  }),
  payment_failed: (data) => ({
    subject: `❌ Payment of ₹${data.amount} failed — NovaPay`,
    html: `
      
        Payment Failed
        Your payment of ₹${data.amount} could not be processed.
        Please try again or contact support if the issue persists.
        Payment ID: ${data.paymentId}
      
    `,
  }),
  account_created: (data) => ({
    subject: `🏦 Your NovaPay ${data.accountType} account is ready`,
    html: `
      
        Account Created Successfully
        Your ${data.accountType} account has been created.
        
          Account Number: ${data.accountNumber}
          Type: ${data.accountType}
          Currency: ${data.currency}
        
      
    `,
  }),
};

const getUserEmail = async (userId) => {
  const result = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
  return result.rows[0] || null;
};

const sendEmail = async (to, template) => {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@novapay.com',
    to,
    subject: template.subject,
    html: template.html,
  });
};

// Event handlers
const handlers = {
  [PAYMENT_EVENTS.COMPLETED]: async (data) => {
    try {
      const user = await getUserEmail(data.userId);
      if (!user) return;
      const template = TEMPLATES.payment_success(data);
      await sendEmail(user.email, template);
      await query('INSERT INTO notifications (user_id, type, status, created_at) VALUES ($1,$2,$3,NOW())',
        [data.userId, 'payment_success', 'sent']);
      logger.info({ message: 'Kafka: payment success email sent', userId: data.userId });
    } catch (err) {
      logger.error({ message: 'Failed to send payment success email', error: err.message });
    }
  },

  [PAYMENT_EVENTS.FAILED]: async (data) => {
    try {
      const user = await getUserEmail(data.userId);
      if (!user) return;
      const template = TEMPLATES.payment_failed(data);
      await sendEmail(user.email, template);
      logger.info({ message: 'Kafka: payment failed email sent', userId: data.userId });
    } catch (err) {
      logger.error({ message: 'Failed to send payment failed email', error: err.message });
    }
  },

  [ACCOUNT_EVENTS.CREATED]: async (data) => {
    try {
      const user = await getUserEmail(data.userId);
      if (!user) return;
      const template = TEMPLATES.account_created(data);
      await sendEmail(user.email, template);
      logger.info({ message: 'Kafka: account created email sent', userId: data.userId });
    } catch (err) {
      logger.error({ message: 'Failed to send account created email', error: err.message });
    }
  },
};

let consumer = null;

const startConsumer = async () => {
  try {
    consumer = await createConsumer(
      'notification-service',
      CONSUMER_GROUPS.NOTIFICATION_SERVICE,
      [TOPICS.PAYMENTS, TOPICS.ACCOUNTS],
      handlers
    );
    logger.info({ message: 'Kafka consumer started — listening on payments + accounts topics' });
  } catch (err) {
    logger.error({ message: 'Failed to start notification Kafka consumer', error: err.message });
    setTimeout(startConsumer, 5000);
  }
};

const stopConsumer = async () => {
  if (consumer) await consumer.disconnect();
};

module.exports = { startConsumer, stopConsumer };

