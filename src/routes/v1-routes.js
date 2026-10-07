import { Router } from 'express'
import { z } from 'zod'

import { validateRequest } from '../middleware/validate-request.js'

export const v1Router = Router()

v1Router.get('/', validateRequest({ query: z.strictObject({}) }), (_request, response) => {
  response.json({
    success: true,
    message: 'Production API v1 is available.',
    data: {
      version: 'v1',
    },
  })
})
