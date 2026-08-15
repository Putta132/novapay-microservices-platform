// =============================================================================
// FILE: services/account-service/src/redis/accountCache.js
// PURPOSE: Cache account data and balances to reduce database load
//
// CACHE INVALIDATION STRATEGY:
//   Read  → check cache first → if miss → read DB → store in cache
//   Write → update DB → immediately delete cache
//   Next read → miss → fetch fresh from DB → store in cache again
//
// This is called Cache-Aside pattern (most common in fintech)
// =============================================================================

const { cacheGet, cacheSet, cacheDelete } = require('../../infrastructure/redis/redisClient');

const TTL = {
  ACCOUNT:      120,   // 2 minutes — account details
  BALANCE:      30,    // 30 seconds — balance (changes on every payment)
  ACCOUNT_LIST: 60,    // 1 minute — user's account list
};

// Cache a single account
const getAccountCache = async (accountId) => {
  return cacheGet(`account:${accountId}`);
};

const setAccountCache = async (accountId, accountData) => {
  await cacheSet(`account:${accountId}`, accountData, TTL.ACCOUNT);
};

const invalidateAccountCache = async (accountId) => {
  await cacheDelete(`account:${accountId}`);
  await cacheDelete(`account:${accountId}:balance`);
};

// Cache user's list of accounts
const getAccountListCache = async (userId) => {
  return cacheGet(`user:${userId}:accounts`);
};

const setAccountListCache = async (userId, accounts) => {
  await cacheSet(`user:${userId}:accounts`, accounts, TTL.ACCOUNT_LIST);
};

const invalidateAccountListCache = async (userId) => {
  await cacheDelete(`user:${userId}:accounts`);
};

// Cache account balance specifically (short TTL — changes on every payment)
const getBalanceCache = async (accountId) => {
  return cacheGet(`account:${accountId}:balance`);
};

const setBalanceCache = async (accountId, balance) => {
  await cacheSet(`account:${accountId}:balance`, { balance }, TTL.BALANCE);
};

module.exports = {
  getAccountCache,
  setAccountCache,
  invalidateAccountCache,
  getAccountListCache,
  setAccountListCache,
  invalidateAccountListCache,
  getBalanceCache,
  setBalanceCache,
};

