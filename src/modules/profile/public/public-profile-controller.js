import { sendCacheablePublicJson } from '../../../utils/public-response.js'
import { serializePublicProfileIdentity } from './public-profile-serializer.js'

const PROFILE_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
const PROFILE_CDN_CACHE_CONTROL = 'max-age=60, stale-while-revalidate=300'
const RESUME_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
const RESUME_CDN_CACHE_CONTROL = 'max-age=60, stale-while-revalidate=300'

export function createPublicProfileController({ profileService }) {
  return {
    getPublicIdentity: async (_request, response) => {
      const identity = await profileService.getPublicIdentity()

      sendCacheablePublicJson(
        response,
        {
          success: true,
          message: 'Public profile retrieved successfully.',
          data: serializePublicProfileIdentity(identity),
        },
        {
          cacheControl: PROFILE_CACHE_CONTROL,
          cdnCacheControl: PROFILE_CDN_CACHE_CONTROL,
        },
      )
    },

    downloadResume: async (_request, response) => {
      const { downloadUrl } = await profileService.getResumeDownloadUrl()

      response
        .set('Cache-Control', RESUME_CACHE_CONTROL)
        .set('CDN-Cache-Control', RESUME_CDN_CACHE_CONTROL)
        .redirect(302, downloadUrl)
    },
  }
}
