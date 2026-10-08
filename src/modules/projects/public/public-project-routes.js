import { Router } from 'express'

import { validateRequest } from '../../../middleware/validate-request.js'
import { createPublicProjectController } from './public-project-controller.js'
import {
  publicProjectDetailQuerySchema,
  publicProjectListQuerySchema,
  publicProjectSlugParamsSchema,
} from './public-project-schemas.js'

export function createPublicProjectRouter({ projectService, mediaService }) {
  const router = Router()
  const controller = createPublicProjectController({ projectService, mediaService })

  router.get('/', validateRequest({ query: publicProjectListQuerySchema }), controller.list)
  router.get(
    '/:slug',
    validateRequest({ params: publicProjectSlugParamsSchema, query: publicProjectDetailQuerySchema }),
    controller.getBySlug,
  )

  return router
}
