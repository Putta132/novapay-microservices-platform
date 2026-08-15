-- ─── NovaPay Database Initialization ───
-- This file is run ONCE when PostgreSQL starts for the first time
-- It creates all 5 databases and their tables

-- Create databases for each service
CREATE DATABASE authdb;
CREATE DATABASE accountdb;
CREATE DATABASE paymentdb;
CREATE DATABASE transactiondb;
CREATE DATABASE notificationdb;

-- ––– Auth Service Tables –––––––––––––––––––––––––
\c authdb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ––– Account Service Tables ––––––––––––––––––––––
\c accountdb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  account_number VARCHAR(20) UNIQUE NOT NULL,
  account_type VARCHAR(20) DEFAULT 'savings',
  balance DECIMAL(15,2) DEFAULT 0.00,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

-- ––– Payment Service Tables ––––––––––––––––––––––
\c paymentdb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE payments (
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
);

-- ––– Transaction Service Tables ––––––––––––––––––
\c transactiondb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID UNIQUE NOT NULL,
  from_account_id UUID NOT NULL,
  to_account_id UUID,
  amount DECIMAL(15,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'completed',
  created_at TIMESTAMP DEFAULT NOW()
);

-- ––– Notification Service Tables –––––––––––––––––
\c notificationdb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  type VARCHAR(50) NOT NULL,
  channel VARCHAR(20) DEFAULT 'email',
  status VARCHAR(20) DEFAULT 'sent',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);