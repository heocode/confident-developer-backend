import { Router } from 'express'
import { z } from 'zod'

import { validateRequest } from '../../../middleware/validate-request.js'
import { createPublicProfileController } from './public-profile-controller.js'

const emptyQuerySchema = z.strictObject({})

export function createPublicProfileRouter({ profileService }) {
  const router = Router()
  const controller = createPublicProfileController({ profileService })

  router.get('/resume', validateRequest({ query: emptyQuerySchema }), controller.downloadResume)

  return router
}
