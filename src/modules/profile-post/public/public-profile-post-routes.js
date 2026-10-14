import { Router } from 'express'

import {
  createProfileLikeRateLimiter,
  createProfileViewRateLimiter,
} from '../../../middleware/api-rate-limiter.js'
import { noStore } from '../../../middleware/no-store.js'
import { requireTrustedOrigin } from '../../../middleware/require-trusted-origin.js'
import { validateRequest } from '../../../middleware/validate-request.js'
import { createPublicProfilePostController } from './public-profile-post-controller.js'
import {
  emptyProfilePostQuerySchema,
  profilePostInteractionBodySchema,
  profilePostInteractionQuerySchema,
} from './public-profile-post-schemas.js'

export function createPublicProfilePostRouter({
  profilePostService,
  environment,
  likeRateLimitOptions,
  viewRateLimitOptions,
}) {
  const router = Router()
  const controller = createPublicProfilePostController({ profilePostService, environment })
  const trustedOrigin = requireTrustedOrigin(environment.clientOrigins)
  const likeRateLimiter = createProfileLikeRateLimiter(likeRateLimitOptions)
  const viewRateLimiter = createProfileViewRateLimiter(viewRateLimitOptions)

  router.get('/', validateRequest({ query: emptyProfilePostQuerySchema }), controller.get)
  router.get(
    '/interaction',
    noStore,
    validateRequest({ query: profilePostInteractionQuerySchema }),
    controller.getInteraction,
  )
  router.put(
    '/like',
    noStore,
    trustedOrigin,
    likeRateLimiter,
    validateRequest({ body: profilePostInteractionBodySchema, query: emptyProfilePostQuerySchema }),
    controller.like,
  )
  router.delete(
    '/like',
    noStore,
    trustedOrigin,
    likeRateLimiter,
    validateRequest({ body: profilePostInteractionBodySchema, query: emptyProfilePostQuerySchema }),
    controller.unlike,
  )
  router.post(
    '/view',
    noStore,
    trustedOrigin,
    viewRateLimiter,
    validateRequest({ body: profilePostInteractionBodySchema, query: emptyProfilePostQuerySchema }),
    controller.view,
  )

  return router
}
