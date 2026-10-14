import { Router } from 'express'
import { z } from 'zod'

import { validateRequest } from '../../../middleware/validate-request.js'
import { createAdminGitHubController } from './admin-github-controller.js'

const emptyObjectSchema = z.strictObject({})
const emptyBodySchema = emptyObjectSchema.default({})

export function createAdminGitHubRouter({ githubService }) {
  const router = Router()
  const controller = createAdminGitHubController({ githubService })

  router.post(
    '/refresh',
    validateRequest({ body: emptyBodySchema, query: emptyObjectSchema }),
    controller.refresh,
  )

  return router
}
