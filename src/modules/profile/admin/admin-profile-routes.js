import { Router } from 'express'

import { validateRequest } from '../../../middleware/validate-request.js'
import { createAdminProfileController } from './admin-profile-controller.js'
import {
  emptyAdminProfileBodySchema,
  emptyAdminProfileQuerySchema,
  replaceResumeBodySchema,
  updatePublicIdentityBodySchema,
} from './admin-profile-schemas.js'

export function createAdminProfileRouter({ profileService }) {
  const router = Router()
  const controller = createAdminProfileController({ profileService })

  router
    .route('/')
    .get(validateRequest({ query: emptyAdminProfileQuerySchema }), controller.getPublicIdentity)
    .put(
      validateRequest({
        body: updatePublicIdentityBodySchema,
        query: emptyAdminProfileQuerySchema,
      }),
      controller.updatePublicIdentity,
    )
  router.post(
    '/resume/upload-signature',
    validateRequest({ body: emptyAdminProfileBodySchema, query: emptyAdminProfileQuerySchema }),
    controller.createResumeUploadSignature,
  )
  router
    .route('/resume')
    .get(validateRequest({ query: emptyAdminProfileQuerySchema }), controller.getResume)
    .put(
      validateRequest({ body: replaceResumeBodySchema, query: emptyAdminProfileQuerySchema }),
      controller.replaceResume,
    )

  return router
}
