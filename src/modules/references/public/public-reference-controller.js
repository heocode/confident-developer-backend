import { sendCacheablePublicJson } from '../../../utils/public-response.js'
import { serializeOwnedReference, serializePublicReference } from './public-reference-serializer.js'

const REFERENCE_CACHE_CONTROL = 'public, max-age=0, s-maxage=30'
const REFERENCE_CDN_CACHE_CONTROL = 'max-age=30'

export function createPublicReferenceController({ referenceService }) {
  return {
    submit: async (request, response) => {
      const { reference, managementToken } = await referenceService.submitReference(
        request.validated.body,
        { remoteIp: request.ip },
      )

      response.status(201).json({
        success: true,
        message: 'Your reference was submitted for review.',
        data: {
          reference: serializeOwnedReference(reference),
          managementToken,
        },
      })
    },

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

    getSubmission: async (request, response) => {
      const reference = await referenceService.getOwnedReference(
        request.validated.params.id,
        request.get('x-reference-management-token'),
      )

      response.json({
        success: true,
        message: 'Reference submission retrieved successfully.',
        data: serializeOwnedReference(reference),
      })
    },

    deleteSubmission: async (request, response) => {
      await referenceService.deleteOwnedReference(
        request.validated.params.id,
        request.get('x-reference-management-token'),
      )

      response.json({
        success: true,
        message: 'Reference submission deleted successfully.',
      })
    },
  }
}
