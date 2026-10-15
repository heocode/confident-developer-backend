import { Router } from 'express'

import { validateRequest } from '../../../middleware/validate-request.js'
import { createAdminReferenceController } from './admin-reference-controller.js'
import {
  adminReferenceIdParamsSchema,
  adminReferenceListQuerySchema,
  moderateAdminReferenceBodySchema,
  updateAdminReferenceBodySchema,
} from './admin-reference-schemas.js'

export function createAdminReferenceRouter({ referenceService }) {
  const router = Router()
  const controller = createAdminReferenceController({ referenceService })

  router.get('/', validateRequest({ query: adminReferenceListQuerySchema }), controller.list)
  router
    .route('/:id')
    .get(validateRequest({ params: adminReferenceIdParamsSchema }), controller.getById)
    .patch(
      validateRequest({ params: adminReferenceIdParamsSchema, body: updateAdminReferenceBodySchema }),
      controller.update,
    )
    .delete(validateRequest({ params: adminReferenceIdParamsSchema }), controller.delete)
  router.patch(
    '/:id/moderation',
    validateRequest({ params: adminReferenceIdParamsSchema, body: moderateAdminReferenceBodySchema }),
    controller.moderate,
  )

  return router
}
