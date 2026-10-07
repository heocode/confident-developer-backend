import { Router } from 'express'

import { validateRequest } from '../../../middleware/validate-request.js'
import { createAdminProjectController } from './admin-project-controller.js'
import {
  adminProjectIdParamsSchema,
  adminProjectListQuerySchema,
  createAdminProjectBodySchema,
  updateAdminProjectBodySchema,
} from './admin-project-schemas.js'

export function createAdminProjectRouter({ projectService }) {
  const router = Router()
  const controller = createAdminProjectController({ projectService })

  router
    .route('/')
    .post(validateRequest({ body: createAdminProjectBodySchema }), controller.create)
    .get(validateRequest({ query: adminProjectListQuerySchema }), controller.list)

  router
    .route('/:id')
    .get(validateRequest({ params: adminProjectIdParamsSchema }), controller.getById)
    .patch(
      validateRequest({ params: adminProjectIdParamsSchema, body: updateAdminProjectBodySchema }),
      controller.update,
    )
    .delete(validateRequest({ params: adminProjectIdParamsSchema }), controller.delete)

  return router
}
