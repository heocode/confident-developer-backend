import { sendCacheablePublicJson } from '../../../utils/public-response.js'
import { serializePublicReference } from './public-reference-serializer.js'

const REFERENCE_CACHE_CONTROL = 'public, max-age=0, s-maxage=30'
const REFERENCE_CDN_CACHE_CONTROL = 'max-age=30'

export function createPublicReferenceController({ referenceService }) {
  return {
    list: async (request, response) => {
      const { items, pagination } = await referenceService.listPublicReferences(request.validated.query)

      sendCacheablePublicJson(
        response,
        {
          success: true,
          message: 'References retrieved successfully.',
          data: { items: items.map(serializePublicReference), pagination },
        },
        {
          cacheControl: REFERENCE_CACHE_CONTROL,
          cdnCacheControl: REFERENCE_CDN_CACHE_CONTROL,
        },
      )
    },
  }
}
