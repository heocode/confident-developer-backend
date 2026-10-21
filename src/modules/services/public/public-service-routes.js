import { Router } from 'express'

import { validateRequest } from '../../../middleware/validate-request.js'
import { createPublicServiceController } from './public-service-controller.js'
import {
  publicServiceDetailQuerySchema,
  publicServiceListQuerySchema,
  publicServiceSlugParamsSchema,
} from './public-service-schemas.js'

export function createPublicServiceRouter({ serviceService, mediaService }) {
  const router = Router()
  const controller = createPublicServiceController({ serviceService, mediaService })

  router.get('/', validateRequest({ query: publicServiceListQuerySchema }), controller.list)
  router.get(
    '/:slug',
    validateRequest({ params: publicServiceSlugParamsSchema, query: publicServiceDetailQuerySchema }),
    controller.getBySlug,
  )

  return router
}
