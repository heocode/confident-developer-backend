import { Router } from 'express'

import { validateRequest } from '../../../middleware/validate-request.js'
import { createAdminContactController } from './admin-contact-controller.js'
import {
  adminContactEmptyQuerySchema,
  adminContactIdParamsSchema,
  adminContactListQuerySchema,
  createAdminContactReplyBodySchema,
  createAdminContactReplyHeadersSchema,
  updateAdminContactStatusBodySchema,
} from './admin-contact-schemas.js'

export function createAdminContactRouter({ contactService }) {
  const router = Router()
  const controller = createAdminContactController({ contactService })

  router.get('/', validateRequest({ query: adminContactListQuerySchema }), controller.list)
  router.post(
    '/:id/replies',
    validateRequest({
      params: adminContactIdParamsSchema,
      query: adminContactEmptyQuerySchema,
      body: createAdminContactReplyBodySchema,
      headers: createAdminContactReplyHeadersSchema,
    }),
    controller.createReply,
  )
  router.patch(
    '/:id/status',
    validateRequest({
      params: adminContactIdParamsSchema,
      query: adminContactEmptyQuerySchema,
      body: updateAdminContactStatusBodySchema,
    }),
    controller.updateStatus,
  )
  router
    .route('/:id')
    .get(
      validateRequest({
        params: adminContactIdParamsSchema,
        query: adminContactEmptyQuerySchema,
      }),
      controller.getById,
    )
    .delete(
      validateRequest({
        params: adminContactIdParamsSchema,
        query: adminContactEmptyQuerySchema,
      }),
      controller.delete,
    )

  return router
}
