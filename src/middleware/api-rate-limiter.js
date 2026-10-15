import { rateLimit } from 'express-rate-limit'

const FIFTEEN_MINUTES = 15 * 60 * 1_000
const ONE_HOUR = 60 * 60 * 1_000

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

export function createLoginRateLimiter({ limit = 5, windowMs = FIFTEEN_MINUTES } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
      success: false,
      message: 'Too many sign-in attempts. Please try again later.',
    },
  })
}

function createInteractionRateLimiter({ limit, windowMs = FIFTEEN_MINUTES }, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, message },
  })
}

export function createProfileLikeRateLimiter({ limit = 30, windowMs = FIFTEEN_MINUTES } = {}) {
  return createInteractionRateLimiter(
    { limit, windowMs },
    'Too many profile post reactions. Please try again later.',
  )
}

export function createProfileViewRateLimiter({ limit = 60, windowMs = FIFTEEN_MINUTES } = {}) {
  return createInteractionRateLimiter(
    { limit, windowMs },
    'Too many profile post views. Please try again later.',
  )
}

export function createReferenceSubmissionRateLimiter({ limit = 5, windowMs = ONE_HOUR } = {}) {
  return createInteractionRateLimiter(
    { limit, windowMs },
    'Too many reference submissions. Please try again later.',
  )
}
