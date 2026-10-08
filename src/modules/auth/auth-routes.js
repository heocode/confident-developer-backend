import { Router } from 'express'

import { createLoginRateLimiter } from '../../middleware/api-rate-limiter.js'
import { noStore } from '../../middleware/no-store.js'
import { requireTrustedOrigin } from '../../middleware/require-trusted-origin.js'
import { validateRequest } from '../../middleware/validate-request.js'
import { createAuthController } from './auth-controller.js'
import { loginBodySchema } from './auth-schemas.js'
import { requireAdminSession } from './require-admin-session.js'

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
