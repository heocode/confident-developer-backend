import { Router } from 'express'
import { z } from 'zod'

import { validateRequest } from '../../../middleware/validate-request.js'
import { createPublicGitHubController } from './public-github-controller.js'

const emptyQuerySchema = z.strictObject({})

export function createPublicGitHubRouter({ githubService }) {
  const router = Router()
  const controller = createPublicGitHubController({ githubService })

  router.get('/', validateRequest({ query: emptyQuerySchema }), controller.getSummary)

  return router
}
