import { serializeAdminReference } from './admin-reference-serializer.js'

export function createAdminReferenceController({ referenceService }) {
  return {
    list: async (request, response) => {
      const { items, pagination } = await referenceService.listAdminReferences(request.validated.query)

      response.json({
        success: true,
        message: 'References retrieved successfully.',
        data: { items: items.map(serializeAdminReference), pagination },
      })
    },

    getById: async (request, response) => {
      const reference = await referenceService.getAdminReference(request.validated.params.id)

      response.json({
        success: true,
        message: 'Reference retrieved successfully.',
        data: serializeAdminReference(reference),
      })
    },

    update: async (request, response) => {
      const reference = await referenceService.updateReference(
        request.validated.params.id,
        request.validated.body,
      )

      response.json({
        success: true,
        message: 'Reference updated successfully.',
        data: serializeAdminReference(reference),
      })
    },

    moderate: async (request, response) => {
      const reference = await referenceService.moderateReference(
        request.validated.params.id,
        request.validated.body,
        request.admin.id,
      )

      response.json({
        success: true,
        message: 'Reference moderation updated successfully.',
        data: serializeAdminReference(reference),
      })
    },

    delete: async (request, response) => {
      await referenceService.deleteReference(request.validated.params.id)

      response.json({ success: true, message: 'Reference deleted successfully.' })
    },
  }
}
