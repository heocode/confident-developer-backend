import { rateLimit } from 'express-rate-limit'

const FIFTEEN_MINUTES = 15 * 60 * 1_000

export function createApiRateLimiter({ limit = 300, windowMs = FIFTEEN_MINUTES } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many requests. Please try again later.',
    },
  })
}
