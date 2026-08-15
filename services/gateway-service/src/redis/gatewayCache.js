// =============================================================================
// FILE: services/gateway-service/src/redis/gatewayCache.js
// PURPOSE: Redis-powered rate limiting in the gateway
//
// WHY REDIS FOR RATE LIMITING (not just express-rate-limit)?
//   express-rate-limit stores counts IN MEMORY of ONE pod.
//   With 3 pods running (HPA), each pod has its own counter.
//   A user could send 30 req/s × 3 pods = 90 req/s and bypass limits.
//
//   Redis stores counts CENTRALLY — shared across ALL gateway pods.
//   This is how Stripe, Razorpay, and every real API does rate limiting.
//
// RATE LIMIT TIERS:
//   General API:  100 requests per minute per user
//   Payment API:  10 requests per minute per user (strict)
//   Auth API:     20 requests per minute per IP
// =============================================================================

const { checkRateLimit } = require('../../infrastructure/redis/redisClient');

const LIMITS = {
  GENERAL:  { max: 100, windowSec: 60  },   // 100 req/min
  PAYMENT:  { max: 10,  windowSec: 60  },   // 10 req/min (payment abuse prevention)
  AUTH:     { max: 20,  windowSec: 60  },   // 20 req/min per IP
};

// Middleware factory — creates a Redis-backed rate limiter
const redisRateLimit = (tier) => {
  const { max, windowSec } = LIMITS[tier];

  return async (req, res, next) => {
    try {
      // Key by user ID if authenticated, otherwise by IP
      const identifier = req.headers['x-user-id'] || req.ip;
      const key = `ratelimit:${tier.toLowerCase()}:${identifier}`;

      const result = await checkRateLimit(key, max, windowSec);

      // Add rate limit headers (same as GitHub API, Stripe API)
      res.set({
        'X-RateLimit-Limit':     max,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Reset':     Date.now() + (result.resetIn * 1000),
      });

      if (!result.allowed) {
        return res.status(429).json({
          error: 'Too many requests. Please slow down.',
          retryAfter: result.resetIn,
        });
      }

      next();
    } catch (err) {
      // If Redis is down, allow the request through (fail open)
      // Better to allow too many than to block all users
      console.warn('Redis rate limit check failed — allowing request:', err.message);
      next();
    }
  };
};

module.exports = {
  generalRateLimit:  redisRateLimit('GENERAL'),
  paymentRateLimit:  redisRateLimit('PAYMENT'),
  authRateLimit:     redisRateLimit('AUTH'),
};

