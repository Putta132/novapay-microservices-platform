const { Client } = require('pg');

// ANSI Colors for clean terminal output
const green = (t) => `\x1b[32m${t}\x1b[0m`;
const blue = (t) => `\x1b[34m${t}\x1b[0m`;
const yellow = (t) => `\x1b[33m${t}\x1b[0m`;
const red = (t) => `\x1b[31m${t}\x1b[0m`;
const cyan = (t) => `\x1b[36m${t}\x1b[0m`;

async function seedDatabase() {
  console.log(blue('\n==================================================='));
  console.log(cyan('   🌱 NovaPay — Multi-Database Seed Engine'));
  console.log(blue('===================================================\n'));

  // ── Step 0: Connect to Default PostgreSQL ────────────────────────
  const rootClient = new Client({
    host: 'localhost',
    port: 5432,
    user: 'novapay',
    password: 'novapay_dev_pass',
    database: 'postgres'
  });

  try {
    await rootClient.connect();
    console.log(green('✅ Connected to PostgreSQL (localhost:5432)'));

    // ── Step 1: Initialize Microservice Databases ──────────────────
    console.log(yellow('\n📦 Step 1: Checking Microservice Databases...'));
    const databases = ['authdb', 'accountdb', 'paymentdb', 'transactiondb', 'notificationdb'];
    for (const db of databases) {
      try {
        await rootClient.query(`CREATE DATABASE ${db}`);
        console.log(green(`   + Created Database: ${db}`));
      } catch (e) {
        console.log(`   ℹ️  Database ${db} already exists`);
      }
    }
    await rootClient.end();

    // ── Step 2: Seed Auth DB ───────────────────────────────────────
    console.log(yellow('\n👤 Step 2: Seeding [authdb] (Users & Credentials)...'));
    const authClient = new Client({
      host: 'localhost', port: 5432, user: 'novapay', password: 'novapay_dev_pass', database: 'authdb'
    });
    await authClient.connect();
    await authClient.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await authClient.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const users = [
      ['a1111111-1111-1111-1111-111111111111', 'prateek@novapay.com',   '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'Prateek Kulkarni'],
      ['a2222222-2222-2222-2222-222222222222', 'sneha@novapay.com',     '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'Sneha Kulkarni'],
      ['a3333333-3333-3333-3333-333333333333', 'rahul@novapay.com',     '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'Rahul Reddy'],
      ['a4444444-4444-4444-4444-444444444444', 'aishwarya@novapay.com', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'Aishwarya Kulkarni'],
      ['a5555555-5555-5555-5555-555555555555', 'karthik@novapay.com',   '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'Karthik Reddy'],
    ];

    await authClient.query('TRUNCATE TABLE users CASCADE');

    for (const [id, email, password_hash, name] of users) {
      await authClient.query(
        `INSERT INTO users (id, email, password_hash, name) 
         VALUES ($1,$2,$3,$4) 
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email`,
        [id, email, password_hash, name]
      );
      console.log(green(`   ✓ User: ${name.padEnd(20)} | Email: ${email}`));
    }
    await authClient.end();

    // ── Step 3: Seed Account DB ────────────────────────────────────
    console.log(yellow('\n🏦 Step 3: Seeding [accountdb] (Wallets & Balances)...'));
    const accountClient = new Client({
      host: 'localhost', port: 5432, user: 'novapay', password: 'novapay_dev_pass', database: 'accountdb'
    });
    await accountClient.connect();
    await accountClient.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await accountClient.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL,
        account_number VARCHAR(20) UNIQUE NOT NULL,
        account_type VARCHAR(20) DEFAULT 'savings',
        balance DECIMAL(15,2) DEFAULT 0.00,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const accounts = [
      ['b1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'NP-ACC-100001', 'savings',  150000.00],
      ['b2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'NP-ACC-100002', 'current',   85000.50],
      ['b3333333-3333-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333', 'NP-ACC-100003', 'savings',  220000.75],
      ['b4444444-4444-4444-4444-444444444444', 'a4444444-4444-4444-4444-444444444444', 'NP-ACC-100004', 'savings',   45000.00],
      ['b5555555-5555-5555-5555-555555555555', 'a5555555-5555-5555-5555-555555555555', 'NP-ACC-100005', 'current',  500000.00],
    ];

    for (const [id, userId, accNum, type, balance] of accounts) {
      await accountClient.query(
        `INSERT INTO accounts (id, user_id, account_number, account_type, balance) 
         VALUES ($1,$2,$3,$4,$5) 
         ON CONFLICT (account_number) DO UPDATE SET balance = EXCLUDED.balance`,
        [id, userId, accNum, type, balance]
      );
      console.log(green(`   ✓ Account: ${accNum} | Type: ${type.padEnd(8)} | Balance: ₹${balance.toLocaleString()}`));
    }
    await accountClient.end();

    // ── Step 4: Seed Payment DB ────────────────────────────────────
    console.log(yellow('\n💳 Step 4: Seeding [paymentdb] (Payment Records)...'));
    const paymentClient = new Client({
      host: 'localhost', port: 5432, user: 'novapay', password: 'novapay_dev_pass', database: 'paymentdb'
    });
    await paymentClient.connect();
    await paymentClient.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await paymentClient.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL,
        from_account_id UUID NOT NULL,
        to_account_id UUID,
        amount DECIMAL(15,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'initiated',
        razorpay_order_id VARCHAR(255),
        razorpay_payment_id VARCHAR(255),
        idempotency_key VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const payments = [
      ['c1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222',  5000.00, 'completed', 'order_NP001', 'pay_NP001', 'IDEMP-001'],
      ['c2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 'b3333333-3333-3333-3333-333333333333', 12500.50, 'completed', 'order_NP002', 'pay_NP002', 'IDEMP-002'],
      ['c3333333-3333-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333', 'b3333333-3333-3333-3333-333333333333', 'b1111111-1111-1111-1111-111111111111',  2000.00, 'completed', 'order_NP003', 'pay_NP003', 'IDEMP-003'],
      ['c4444444-4444-4444-4444-444444444444', 'a4444444-4444-4444-4444-444444444444', 'b4444444-4444-4444-4444-444444444444', 'b5555555-5555-5555-5555-555555555555', 75000.00, 'completed', 'order_NP004', 'pay_NP004', 'IDEMP-004'],
      ['c5555555-5555-5555-5555-555555555555', 'a5555555-5555-5555-5555-555555555555', 'b5555555-5555-5555-5555-555555555555', 'b1111111-1111-1111-1111-111111111111',  1500.00, 'initiated', 'order_NP005', null,        'IDEMP-005'],
      ['c6666666-6666-6666-6666-666666666666', 'a1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'b4444444-4444-4444-4444-444444444444',  8000.00, 'completed', 'order_NP006', 'pay_NP006', 'IDEMP-006'],
      ['c7777777-7777-7777-7777-777777777777', 'a2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 'b5555555-5555-5555-5555-555555555555', 25000.00, 'failed',    'order_NP007', null,        'IDEMP-007'],
      ['c8888888-8888-8888-8888-888888888888', 'a3333333-3333-3333-3333-333333333333', 'b3333333-3333-3333-3333-333333333333', 'b2222222-2222-2222-2222-222222222222',  3500.00, 'completed', 'order_NP008', 'pay_NP008', 'IDEMP-008'],
    ];

    for (const [id, userId, fromAcc, toAcc, amount, status, rzOrd, rzPay, idemp] of payments) {
      await paymentClient.query(
        `INSERT INTO payments (id, user_id, from_account_id, to_account_id, amount, status, razorpay_order_id, razorpay_payment_id, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) 
         ON CONFLICT (idempotency_key) DO UPDATE SET status = EXCLUDED.status`,
        [id, userId, fromAcc, toAcc, amount, status, rzOrd, rzPay, idemp]
      );
      console.log(green(`   ✓ Payment: ₹${amount.toLocaleString().padEnd(8)} | Status: ${status.toUpperCase().padEnd(9)} | Key: ${idemp}`));
    }
    await paymentClient.end();

    // ── Step 5: Seed Transaction DB ────────────────────────────────
    console.log(yellow('\n📋 Step 5: Seeding [transactiondb] (Ledger Entries)...'));
    const txClient = new Client({
      host: 'localhost', port: 5432, user: 'novapay', password: 'novapay_dev_pass', database: 'transactiondb'
    });
    await txClient.connect();
    await txClient.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await txClient.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        payment_id UUID UNIQUE NOT NULL,
        from_account_id UUID NOT NULL,
        to_account_id UUID,
        amount DECIMAL(15,2) NOT NULL,
        status VARCHAR(20) DEFAULT 'completed',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const transactions = [
      ['c1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222',  5000.00, 'completed'],
      ['c2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 'b3333333-3333-3333-3333-333333333333', 12500.50, 'completed'],
      ['c3333333-3333-3333-3333-333333333333', 'b3333333-3333-3333-3333-333333333333', 'b1111111-1111-1111-1111-111111111111',  2000.00, 'completed'],
      ['c4444444-4444-4444-4444-444444444444', 'b4444444-4444-4444-4444-444444444444', 'b5555555-5555-5555-5555-555555555555', 75000.00, 'completed'],
      ['c6666666-6666-6666-6666-666666666666', 'b1111111-1111-1111-1111-111111111111', 'b4444444-4444-4444-4444-444444444444',  8000.00, 'completed'],
      ['c8888888-8888-8888-8888-888888888888', 'b3333333-3333-3333-3333-333333333333', 'b2222222-2222-2222-2222-222222222222',  3500.00, 'completed'],
    ];

    for (const [payId, fromAcc, toAcc, amount, status] of transactions) {
      await txClient.query(
        `INSERT INTO transactions (payment_id, from_account_id, to_account_id, amount, status)
         VALUES ($1,$2,$3,$4,$5) 
         ON CONFLICT (payment_id) DO UPDATE SET status = EXCLUDED.status`,
        [payId, fromAcc, toAcc, amount, status]
      );
      console.log(green(`   ✓ Txn Ledger: PayID: ${payId.substring(0,8)}... | Amount: ₹${amount.toLocaleString().padEnd(8)} | ${status.toUpperCase()}`));
    }
    await txClient.end();

    // ── Step 6: Seed Notification DB ───────────────────────────────
    console.log(yellow('\n🔔 Step 6: Seeding [notificationdb] (Notifications & Channels)...'));
    const notifClient = new Client({
      host: 'localhost', port: 5432, user: 'novapay', password: 'novapay_dev_pass', database: 'notificationdb'
    });
    await notifClient.connect();
    await notifClient.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await notifClient.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL,
        type VARCHAR(50) NOT NULL,
        channel VARCHAR(20) DEFAULT 'email',
        status VARCHAR(20) DEFAULT 'sent',
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const notifications = [
      ['a1111111-1111-1111-1111-111111111111', 'PAYMENT_SENT',     'email', 'sent', { amount: 5000, recipient: 'Sneha Kulkarni' }],
      ['a2222222-2222-2222-2222-222222222222', 'PAYMENT_RECEIVED', 'sms',   'sent', { amount: 5000, sender: 'Prateek Kulkarni' }],
      ['a2222222-2222-2222-2222-222222222222', 'PAYMENT_SENT',     'email', 'sent', { amount: 12500, recipient: 'Rahul Reddy' }],
      ['a3333333-3333-3333-3333-333333333333', 'PAYMENT_RECEIVED', 'email', 'sent', { amount: 12500, sender: 'Sneha Kulkarni' }],
      ['a4444444-4444-4444-4444-444444444444', 'PAYMENT_SENT',     'sms',   'sent', { amount: 75000, recipient: 'Karthik Reddy' }],
      ['a5555555-5555-5555-5555-555555555555', 'PAYMENT_RECEIVED', 'email', 'sent', { amount: 75000, sender: 'Aishwarya Kulkarni' }],
      ['a1111111-1111-1111-1111-111111111111', 'SECURITY_ALERT',   'email', 'sent', { ip: '192.168.1.100', device: 'Windows Desktop' }],
    ];

    for (const [userId, type, channel, status, metadata] of notifications) {
      await notifClient.query(
        `INSERT INTO notifications (user_id, type, channel, status, metadata) 
         VALUES ($1,$2,$3,$4,$5)`,
        [userId, type, channel, status, JSON.stringify(metadata)]
      );
      console.log(green(`   ✓ Alert: [${type.padEnd(16)}] | Channel: ${channel.padEnd(5)} | User: ${userId.substring(0,8)}...`));
    }
    // ── Step 7: Seed Redis Cache ──────────────────────────────────
    console.log(yellow('\n⚡ Step 7: Seeding [Redis] (Session Cache & Rate Limiting)...'));
    try {
      const Redis = require('ioredis');
      const redis = new Redis({ host: 'localhost', port: 6379, retryStrategy: () => null });
      
      await redis.set('session:prateek@novapay.com', JSON.stringify({ userId: 'a1111111-1111-1111-1111-111111111111', role: 'admin', token: 'jwt_mock_token_prateek_001' }), 'EX', 3600);
      await redis.set('session:sneha@novapay.com', JSON.stringify({ userId: 'a2222222-2222-2222-2222-222222222222', role: 'user', token: 'jwt_mock_token_sneha_002' }), 'EX', 3600);
      await redis.set('rate_limit:ip:192.168.1.100', '18', 'EX', 60);
      await redis.set('cache:balance:NP-ACC-100001', '150000.00', 'EX', 300);
      await redis.set('cache:balance:NP-ACC-100002', '85000.50', 'EX', 300);

      console.log(green('   ✓ Cached JWT Session: session:prateek@novapay.com (Admin)'));
      console.log(green('   ✓ Cached JWT Session: session:sneha@novapay.com (User)'));
      console.log(green('   ✓ Rate Limiting Key : rate_limit:ip:192.168.1.100 (18 req/min)'));
      console.log(green('   ✓ Fast Balance Cache: cache:balance:NP-ACC-100001 (₹1,50,000)'));
      
      redis.disconnect();
    } catch (rErr) {
      console.log(yellow('   ℹ️ Redis not reachable, skipping Redis cache seeding.'));
    }

    // ── Completion Summary ─────────────────────────────────────────
    console.log(blue('\n==================================================='));
    console.log(green('   🎉 ALL MICROSERVICE DATABASES & CACHE SEEDED!'));
    console.log(blue('==================================================='));
    console.log(cyan('\n📊 Complete State Summary:'));
    console.log('   🐘 PostgreSQL [authdb]         : 5 Active Users (BCrypt Passwords)');
    console.log('   🏦 PostgreSQL [accountdb]      : 5 Account Balances (INR Wallets)');
    console.log('   💳 PostgreSQL [paymentdb]      : 8 Payment Records (Completed/Failed)');
    console.log('   📋 PostgreSQL [transactiondb]  : 6 Double-Entry Ledger Transactions');
    console.log('   🔔 PostgreSQL [notificationdb] : 7 Notification Logs (Email/SMS)');
    console.log('   ⚡ Redis Cache (Port 6379)     : Active JWT Sessions & Fast Balances\n');

  } catch (err) {
    console.error(red('\n❌ Connection Error: ' + err.message));
    console.log(yellow('\nTip: Make sure PostgreSQL container is running:'));
    console.log(cyan('     docker compose up postgres redis -d\n'));
  }
}

seedDatabase();
