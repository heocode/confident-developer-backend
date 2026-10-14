import { Router } from 'express'

import { validateRequest } from '../../../middleware/validate-request.js'
import { createAdminServiceController } from './admin-service-controller.js'
import {
  adminServiceIdParamsSchema,
  adminServiceListQuerySchema,
  createAdminServiceBodySchema,
  updateAdminServiceBodySchema,
} from './admin-service-schemas.js'

export function createAdminServiceRouter({ serviceService }) {
  const router = Router()
  const controller = createAdminServiceController({ serviceService })

  router
    .route('/')
    .post(validateRequest({ body: createAdminServiceBodySchema }), controller.create)
    .get(validateRequest({ query: adminServiceListQuerySchema }), controller.list)

  router
    .route('/:id')
    .get(validateRequest({ params: adminServiceIdParamsSchema }), controller.getById)
    .patch(
      validateRequest({ params: adminServiceIdParamsSchema, body: updateAdminServiceBodySchema }),
      controller.update,
    )
    .delete(validateRequest({ params: adminServiceIdParamsSchema }), controller.delete)

  return router
}
