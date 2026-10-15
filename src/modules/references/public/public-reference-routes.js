import { Router } from 'express'

import { createReferenceSubmissionRateLimiter } from '../../../middleware/api-rate-limiter.js'
import { noStore } from '../../../middleware/no-store.js'
import { requireTrustedOrigin } from '../../../middleware/require-trusted-origin.js'
import { validateRequest } from '../../../middleware/validate-request.js'
import { createPublicReferenceController } from './public-reference-controller.js'
import {
  publicReferenceEmptyQuerySchema,
  publicReferenceListQuerySchema,
  publicReferenceSubmissionParamsSchema,
  submitPublicReferenceBodySchema,
} from './public-reference-schemas.js'

export function createPublicReferenceRouter({ referenceService, environment, submissionRateLimitOptions }) {
  const router = Router()
  const controller = createPublicReferenceController({ referenceService })
  const trustedOrigin = requireTrustedOrigin(environment.clientOrigins)
  const submissionRateLimiter = createReferenceSubmissionRateLimiter(submissionRateLimitOptions)

  router
    .route('/')
    .get(validateRequest({ query: publicReferenceListQuerySchema }), controller.list)
    .post(
      noStore,
      trustedOrigin,
      submissionRateLimiter,
      validateRequest({ query: publicReferenceEmptyQuerySchema, body: submitPublicReferenceBodySchema }),
      controller.submit,
    )
  router.get(
    '/submissions/:id',
    noStore,
    validateRequest({
      params: publicReferenceSubmissionParamsSchema,
      query: publicReferenceEmptyQuerySchema,
    }),
    controller.getSubmission,
  )
  router.delete(
    '/:id/submission',
    noStore,
    trustedOrigin,
    validateRequest({
      params: publicReferenceSubmissionParamsSchema,
      query: publicReferenceEmptyQuerySchema,
    }),
    controller.deleteSubmission,
  )

  return router
}
