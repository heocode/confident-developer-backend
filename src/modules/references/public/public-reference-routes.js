import { Router } from 'express'

import { validateRequest } from '../../../middleware/validate-request.js'
import { createPublicReferenceController } from './public-reference-controller.js'
import { publicReferenceListQuerySchema } from './public-reference-schemas.js'

export function createPublicReferenceRouter({ referenceService }) {
  const router = Router()
  const controller = createPublicReferenceController({ referenceService })

  router.get('/', validateRequest({ query: publicReferenceListQuerySchema }), controller.list)

  return router
}
