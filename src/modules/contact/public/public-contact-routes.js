import { Router } from 'express'

import { createContactSubmissionRateLimiter } from '../../../middleware/api-rate-limiter.js'
import { noStore } from '../../../middleware/no-store.js'
import { requireTrustedOrigin } from '../../../middleware/require-trusted-origin.js'
import { validateRequest } from '../../../middleware/validate-request.js'
import { createPublicContactController } from './public-contact-controller.js'
import {
  publicContactEmptyQuerySchema,
  submitPublicContactBodySchema,
} from './public-contact-schemas.js'

export function createPublicContactRouter({ contactService, environment, submissionRateLimitOptions }) {
  const router = Router()
  const controller = createPublicContactController({ contactService })

  router.post(
    '/',
    noStore,
    requireTrustedOrigin(environment.clientOrigins),
    createContactSubmissionRateLimiter(submissionRateLimitOptions),
    validateRequest({ query: publicContactEmptyQuerySchema, body: submitPublicContactBodySchema }),
    controller.submit,
  )

  return router
}
