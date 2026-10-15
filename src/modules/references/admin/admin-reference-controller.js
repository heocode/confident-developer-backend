import {
  serializeAdminReference,
  serializeAdminReferenceSettings,
} from './admin-reference-serializer.js'

export function createAdminReferenceController({ referenceService }) {
  return {
    getSettings: async (_request, response) => {
      const settings = await referenceService.getReferenceSettings()

      response.json({
        success: true,
        message: 'Reference section settings retrieved successfully.',
        data: serializeAdminReferenceSettings(settings),
      })
    },

    updateSettings: async (request, response) => {
      const result = await referenceService.updateReferenceSettings(request.validated.body)

      response.status(result.created ? 201 : 200).json({
        success: true,
        message: result.created
          ? 'Reference section settings created successfully.'
          : result.changed
            ? 'Reference section settings updated successfully.'
            : 'Reference section settings are already up to date.',
        data: serializeAdminReferenceSettings(result.settings),
      })
    },

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
