import { Router } from 'express'

import { validateRequest } from '../../../middleware/validate-request.js'
import { createPublicServiceController } from './public-service-controller.js'
import { publicServiceListQuerySchema } from './public-service-schemas.js'

export function createPublicServiceRouter({ serviceService }) {
  const router = Router()
  const controller = createPublicServiceController({ serviceService })

  router.get('/', validateRequest({ query: publicServiceListQuerySchema }), controller.list)

  return router
}
