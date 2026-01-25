// src/lib/middleware/rateLimit.ts
import type { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: NextApiRequest) => string;
  message?: string;
}

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

// In-memory store (use Redis in production for multi-instance deployments)
const requestCounts = new Map<string, RateLimitRecord>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of requestCounts.entries()) {
    if (now > record.resetAt) {
      requestCounts.delete(key);
    }
  }
}, 60000); // Cleanup every minute

function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0];
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function rateLimit(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = getClientIp,
    message = 'Too many requests, please try again later',
  } = config;

  return function rateLimitMiddleware(handler: NextApiHandler): NextApiHandler {
    return async (req: NextApiRequest, res: NextApiResponse) => {
      const key = keyGenerator(req);
      const now = Date.now();

      let record = requestCounts.get(key);

      if (!record || now > record.resetAt) {
        // New window
        record = { count: 1, resetAt: now + windowMs };
        requestCounts.set(key, record);
      } else if (record.count >= maxRequests) {
        // Rate limit exceeded
        const retryAfter = Math.ceil((record.resetAt - now) / 1000);

        res.setHeader('X-RateLimit-Limit', maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', record.resetAt.toString());
        res.setHeader('Retry-After', retryAfter.toString());

        return res.status(429).json({
          success: false,
          error: message,
          retryAfter,
        });
      } else {
        // Increment count
        record.count++;
      }

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count).toString());
      res.setHeader('X-RateLimit-Reset', record.resetAt.toString());

      return handler(req, res);
    };
  };
}

// Pre-configured limiters for common use cases

// General API endpoints: 60 requests per minute
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 60,
  message: 'Too many requests, please try again later',
});

// AI endpoints: 10 requests per minute (more expensive)
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 10,
  message: 'AI analysis rate limit exceeded, please wait before trying again',
});

// Upload endpoints: 20 requests per minute
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 20,
  message: 'Upload rate limit exceeded, please wait before uploading more files',
});

// Webhook endpoints: 100 requests per minute (high throughput)
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 100,
  message: 'Webhook rate limit exceeded',
});

// Strict limiter for sensitive operations: 5 requests per minute
export const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 5,
  message: 'Rate limit exceeded for this operation',
});
