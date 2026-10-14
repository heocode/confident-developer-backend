import { Router } from 'express'
import { z } from 'zod'

import { validateRequest } from '../../../middleware/validate-request.js'
import { createAdminProfilePostController } from './admin-profile-post-controller.js'
import { replaceProfilePostBodySchema } from './admin-profile-post-schemas.js'

const emptyQuerySchema = z.strictObject({})

export function createAdminProfilePostRouter({ profilePostService }) {
  const router = Router()
  const controller = createAdminProfilePostController({ profilePostService })

  router
    .route('/')
    .get(validateRequest({ query: emptyQuerySchema }), controller.get)
    .put(
      validateRequest({ body: replaceProfilePostBodySchema, query: emptyQuerySchema }),
      controller.replace,
    )

  return router
}
