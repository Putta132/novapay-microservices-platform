// =============================================================================
// FILE: services/auth-service/src/redis/authCache.js
// PURPOSE: Redis caching for auth-service
//
// USE CASES:
//   1. JWT Token Blacklist — when user logs out, token is blacklisted
//      Without this: logged-out tokens still work until they expire
//      With this: logged-out tokens are invalid immediately
//
//   2. Login attempt rate limiting per user
//      Prevents brute force attacks on login endpoint
//      After 5 failed attempts → block for 15 minutes
//
//   3. User profile caching
//      Avoids hitting DB for every token verification
// =============================================================================

const {
  cacheGet,
  cacheSet,
  cacheDelete,
  blacklistToken,
  isTokenBlacklisted,
  checkRateLimit,
} = require('../../infrastructure/redis/redisClient');

const TTL = {
  USER_PROFILE: 300,      // 5 minutes — user data rarely changes
  LOGIN_WINDOW: 900,      // 15 minutes — rate limit window
};

// ─── User profile cache ───────────────────────────────────────────────────────

const getUserCache = async (userId) => {
  return cacheGet(`user:${userId}`);
};

const setUserCache = async (userId, userData) => {
  // Never cache password hash
  const { password_hash, ...safeData } = userData;
  await cacheSet(`user:${userId}`, safeData, TTL.USER_PROFILE);
};

const invalidateUserCache = async (userId) => {
  await cacheDelete(`user:${userId}`);
};

// ─── Login rate limiting ──────────────────────────────────────────────────────
// Max 5 failed login attempts per 15 minutes per email
const checkLoginRateLimit = async (email) => {
  return checkRateLimit(
    `login:attempts:${email}`,
    5,               // Max 5 attempts
    TTL.LOGIN_WINDOW // Per 15 minutes
  );
};

const resetLoginAttempts = async (email) => {
  await cacheDelete(`login:attempts:${email}`);
};

// ─── Token blacklist (logout) ─────────────────────────────────────────────────
// TTL should match JWT expiry so blacklist entry auto-deletes when token expires
const revokeToken = async (token, jwtExpirySeconds = 86400) => {
  await blacklistToken(token, jwtExpirySeconds);
};

const isRevoked = async (token) => {
  return isTokenBlacklisted(token);
};

module.exports = {
  getUserCache,
  setUserCache,
  invalidateUserCache,
  checkLoginRateLimit,
  resetLoginAttempts,
  revokeToken,
  isRevoked,
};

