import { Router } from 'express'

import { validateRequest } from '../../../middleware/validate-request.js'
import { createAdminMediaController } from './admin-media-controller.js'
import {
  adminMediaIdParamsSchema,
  adminMediaListQuerySchema,
  createMediaUploadSignatureBodySchema,
  registerAdminMediaBodySchema,
  updateAdminMediaBodySchema,
} from './admin-media-schemas.js'

export function createAdminMediaRouter({ mediaService }) {
  const router = Router()
  const controller = createAdminMediaController({ mediaService })

  router.post(
    '/upload-signature',
    validateRequest({ body: createMediaUploadSignatureBodySchema }),
    controller.createUploadSignature,
  )

  router
    .route('/')
    .post(validateRequest({ body: registerAdminMediaBodySchema }), controller.register)
    .get(validateRequest({ query: adminMediaListQuerySchema }), controller.list)

  router
    .route('/:id')
    .get(validateRequest({ params: adminMediaIdParamsSchema }), controller.getById)
    .patch(
      validateRequest({ params: adminMediaIdParamsSchema, body: updateAdminMediaBodySchema }),
      controller.update,
    )
    .delete(validateRequest({ params: adminMediaIdParamsSchema }), controller.delete)

  return router
}
