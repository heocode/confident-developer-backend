import { Router } from 'express'
import { z } from 'zod'

import { noStore } from '../middleware/no-store.js'
import { requireTrustedOrigin } from '../middleware/require-trusted-origin.js'
import { validateRequest } from '../middleware/validate-request.js'
import { serializeAdmin } from '../modules/auth/admin-serializer.js'
import { createAuthRouter } from '../modules/auth/auth-routes.js'
import { requireAdminSession } from '../modules/auth/require-admin-session.js'
import { createAdminMediaRouter } from '../modules/media/admin/admin-media-routes.js'
import { createAdminProjectRouter } from '../modules/projects/admin/admin-project-routes.js'
import { createPublicProjectRouter } from '../modules/projects/public/public-project-routes.js'

export function createV1Router({
  authService,
  mediaService,
  projectService,
  publicProjectService,
  environment,
  loginRateLimitOptions,
}) {
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
    '/projects',
    createPublicProjectRouter({ projectService: publicProjectService, mediaService }),
  )
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
  router.use('/admin/media', createAdminMediaRouter({ mediaService }))
  router.use('/admin/projects', createAdminProjectRouter({ projectService }))

  return router
}
