import { Router } from 'express'
import { z } from 'zod'

import { createAuthController } from '../controllers/auth-controller.js'
import { createLoginRateLimiter } from '../middleware/api-rate-limiter.js'
import { noStore } from '../middleware/no-store.js'
import { requireAdminSession } from '../middleware/require-admin-session.js'
import { requireTrustedOrigin } from '../middleware/require-trusted-origin.js'
import { validateRequest } from '../middleware/validate-request.js'

const loginBodySchema = z.strictObject({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z
    .string()
    .min(1)
    .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, 'Password must not exceed 72 UTF-8 bytes'),
})

export function createAuthRouter({ authService, environment, loginRateLimitOptions }) {
  const router = Router()
  const controller = createAuthController({ authService, environment })
  const trustedOrigin = requireTrustedOrigin(environment.clientOrigins)
  const adminSession = requireAdminSession({ authService, environment })

  router.use(noStore)
  router.post(
    '/login',
    trustedOrigin,
    createLoginRateLimiter(loginRateLimitOptions),
    validateRequest({ body: loginBodySchema }),
    controller.login,
  )
  router.get('/session', adminSession, controller.getSession)
  router.post('/logout', trustedOrigin, controller.logout)

  return router
}
