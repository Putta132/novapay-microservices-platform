const express = require('express');
const nodemailer = require('nodemailer');
const Joi = require('joi');
const { query } = require('../utils/db');
const logger = require('../utils/logger');

const router = express.Router();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

const TEMPLATES = {
  payment_success: (data) => ({
    subject: `Payment of ₹${data.amount} successful`,
    html: `Payment SuccessfulYour payment of ₹${data.amount} ${data.currency} was processed successfully.Payment ID: ${data.paymentId}`
  }),
  payment_failed: (data) => ({
    subject: 'Payment failed',
    html: `Payment FailedYour payment of ₹${data.amount} could not be processed. Please try again.`
  }),
  account_created: (data) => ({
    subject: 'Account created successfully',
    html: `Welcome to NovaPay!Your ${data.accountType} account has been created. Account number: ${data.accountNumber}`
  }),
  welcome: (data) => ({
    subject: 'Welcome to NovaPay',
    html: `Welcome, ${data.name}!Your NovaPay account is ready. Start making payments today.`
  })
};

const sendSchema = Joi.object({
  userId: Joi.string().required(),
  type: Joi.string().valid(...Object.keys(TEMPLATES)).required(),
  data: Joi.object().required(),
  email: Joi.string().email().optional()
});

// POST /api/notifications/send
router.post('/send', async (req, res, next) => {
  try {
    const { error, value } = sendSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    const { userId, type, data, email } = value;

    // Get user email from DB if not provided
    let recipientEmail = email;
    if (!recipientEmail) {
      const userResult = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
      if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      recipientEmail = userResult.rows[0].email;
    }

    const template = TEMPLATES[type](data);

    // Send email
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@novapay.com',
      to: recipientEmail,
      subject: template.subject,
      html: template.html
    });

    // Log notification
    await query('INSERT INTO notifications (user_id, type, status, created_at) VALUES ($1,$2,$3,NOW())', [userId, type, 'sent']);

    req.app.get('notificationCounter').inc({ type, channel: 'email' });
    logger.info({ message: 'Notification sent', userId, type, email: recipientEmail });
    res.json({ success: true, type, recipient: recipientEmail });
  } catch (err) { next(err); }
});

// GET /api/notifications/:userId — list notifications for a user
router.get('/:userId', async (req, res, next) => {
  try {
    const result = await query('SELECT id, type, status, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.params.userId]);
    res.json({ notifications: result.rows });
  } catch (err) { next(err); }
});

module.exports = router;
