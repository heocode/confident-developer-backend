import { sendCacheablePublicJson } from '../../../utils/public-response.js'
import {
  ensureVisitorToken,
  hashVisitorToken,
  readVisitorToken,
} from '../visitor-cookie.js'
import {
  serializeProfilePostInteraction,
  serializeProfilePostView,
  serializePublicProfilePost,
} from './public-profile-post-serializer.js'

const PROFILE_POST_CACHE_CONTROL = 'public, max-age=0, s-maxage=15, stale-while-revalidate=30'
const PROFILE_POST_CDN_CACHE_CONTROL = 'max-age=15, stale-while-revalidate=30'

export function createPublicProfilePostController({ profilePostService, environment }) {
  return {
    get: async (_request, response) => {
      const post = await profilePostService.getPost()

      sendCacheablePublicJson(
        response,
        {
          success: true,
          message: 'Profile post retrieved successfully.',
          data: serializePublicProfilePost(post),
        },
        {
          cacheControl: PROFILE_POST_CACHE_CONTROL,
          cdnCacheControl: PROFILE_POST_CDN_CACHE_CONTROL,
        },
      )
    },

    getInteraction: async (request, response) => {
      const token = readVisitorToken(request, environment)
      const result = await profilePostService.getInteraction({
        revision: request.validated.query.revision,
        visitorHash: hashVisitorToken(token),
      })

      response.json({
        success: true,
        message: 'Profile post interaction retrieved successfully.',
        data: serializeProfilePostInteraction(result),
      })
    },

    like: async (request, response) => {
      const token = ensureVisitorToken(request, response, environment)
      const result = await profilePostService.like({
        revision: request.validated.body.revision,
        visitorHash: hashVisitorToken(token),
      })

      response.json({
        success: true,
        message: result.changed ? 'Profile post liked successfully.' : 'Profile post is already liked.',
        data: serializeProfilePostInteraction(result),
      })
    },

    unlike: async (request, response) => {
      const token = readVisitorToken(request, environment)
      const result = await profilePostService.unlike({
        revision: request.validated.body.revision,
        visitorHash: hashVisitorToken(token),
      })

      response.json({
        success: true,
        message: result.changed ? 'Profile post unliked successfully.' : 'Profile post is not liked.',
        data: serializeProfilePostInteraction(result),
      })
    },

    view: async (request, response) => {
      const token = ensureVisitorToken(request, response, environment)
      const result = await profilePostService.recordView({
        revision: request.validated.body.revision,
        visitorHash: hashVisitorToken(token),
      })

      response.json({
        success: true,
        message: result.recorded
          ? 'Profile post view recorded successfully.'
          : 'Profile post view was already recorded recently.',
        data: serializeProfilePostView(result),
      })
    },
  }
}
