import { Router } from 'express'

import { validateRequest } from '../../../middleware/validate-request.js'
import { createAdminContactController } from './admin-contact-controller.js'
import {
  adminContactEmptyQuerySchema,
  adminContactIdParamsSchema,
  adminContactReplyIdParamsSchema,
  adminContactListQuerySchema,
  createAdminContactReplyBodySchema,
  createAdminContactReplyHeadersSchema,
  retryAdminEmailHeadersSchema,
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
  router.post(
    '/:id/owner-notification/retry',
    validateRequest({
      params: adminContactIdParamsSchema,
      query: adminContactEmptyQuerySchema,
      headers: retryAdminEmailHeadersSchema,
    }),
    controller.retryOwnerNotification,
  )
  router.post(
    '/:id/replies/:replyId/retry',
    validateRequest({
      params: adminContactReplyIdParamsSchema,
      query: adminContactEmptyQuerySchema,
      headers: retryAdminEmailHeadersSchema,
    }),
    controller.retryReply,
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
