// =============================================================================
// FILE: infrastructure/redis/redisClient.js
// PURPOSE: Shared Redis client for caching and rate limiting
// =============================================================================

const Redis = require('ioredis');

let redisClient = null;

const getRedisClient = () => {
  if (redisClient) return redisClient;

  redisClient = new Redis({
    host: process.env.REDIS_HOST || 'redis',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times) => {
      if (times > 10) return null;
      return Math.min(times * 100, 3000);
    },
    keyPrefix: 'novapay:',
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  });

  redisClient.on('connect', () => {
    console.log(JSON.stringify({ message: 'Redis connected' }));
  });

  redisClient.on('error', (err) => {
    console.error(JSON.stringify({ message: 'Redis error', error: err.message }));
  });

  return redisClient;
};

const cacheGet = async (key) => {
  const client = getRedisClient();
  const value = await client.get(key);
  return value ? JSON.parse(value) : null;
};

const cacheSet = async (key, value, ttlSeconds = 300) => {
  const client = getRedisClient();
  await client.setex(key, ttlSeconds, JSON.stringify(value));
};

const cacheDelete = async (key) => {
  const client = getRedisClient();
  await client.del(key);
};

const cacheDeletePattern = async (pattern) => {
  const client = getRedisClient();
  const keys = await client.keys("novapay:" + pattern);
  if (keys.length > 0) {
    const keysWithoutPrefix = keys.map(k => k.replace("novapay:", ""));
    await client.del(...keysWithoutPrefix);
  }
};

const checkRateLimit = async (key, maxRequests, windowSeconds) => {
  const client = getRedisClient();
  const current = await client.incr(key);

  if (current === 1) {
    await client.expire(key, windowSeconds);
  }

  const ttl = await client.ttl(key);

  return {
    allowed: current <= maxRequests,
    current,
    remaining: Math.max(0, maxRequests - current),
    resetIn: ttl,
  };
};

const blacklistToken = async (token, ttlSeconds) => {
  const client = getRedisClient();
  await client.setex("blacklist:" + token, ttlSeconds, "1");
};

const isTokenBlacklisted = async (token) => {
  const client = getRedisClient();
  const result = await client.get("blacklist:" + token);
  return result !== null;
};

module.exports = {
  getRedisClient,
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheDeletePattern,
  checkRateLimit,
  blacklistToken,
  isTokenBlacklisted,
};