import { Router } from 'express'
import { z } from 'zod'

import { noStore } from '../middleware/no-store.js'
import { requireAdminSession } from '../middleware/require-admin-session.js'
import { requireTrustedOrigin } from '../middleware/require-trusted-origin.js'
import { validateRequest } from '../middleware/validate-request.js'
import { serializeAdmin } from '../utils/admin-serializer.js'
import { createAuthRouter } from './auth-routes.js'

export function createV1Router({ authService, environment, loginRateLimitOptions }) {
  const router = Router()

  router.get('/', validateRequest({ query: z.strictObject({}) }), (_request, response) => {
    response.json({
      success: true,
      message: 'Production API v1 is available.',
      data: {
        version: 'v1',
      },
    })
  })

  router.use('/auth', createAuthRouter({ authService, environment, loginRateLimitOptions }))
  router.use(
    '/admin',
    noStore,
    requireTrustedOrigin(environment.clientOrigins),
    requireAdminSession({ authService, environment }),
  )
  router.get('/admin', (request, response) => {
    response.json({
      success: true,
      message: 'Admin API is available.',
      data: serializeAdmin(request.admin),
    })
  })

  return router
}
