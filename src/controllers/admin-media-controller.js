import { serializeAdminMediaAsset } from '../utils/admin-media-serializer.js'

export function createAdminMediaController({ mediaService }) {
  return {
    createUploadSignature: async (_request, response) => {
      const descriptor = await mediaService.createUploadDescriptor()

      response.json({
        success: true,
        message: 'Media upload signature created successfully.',
        data: descriptor,
      })
    },

    register: async (request, response) => {
      const { asset, created } = await mediaService.registerAsset(request.validated.body)

      response.status(created ? 201 : 200).json({
        success: true,
        message: created ? 'Media asset registered successfully.' : 'Media asset already registered.',
        data: serializeAdminMediaAsset(asset),
      })
    },

    list: async (request, response) => {
      const { items, pagination } = await mediaService.listAssets(request.validated.query)

      response.json({
        success: true,
        message: 'Media assets retrieved successfully.',
        data: {
          items: items.map(serializeAdminMediaAsset),
          pagination,
        },
      })
    },

    getById: async (request, response) => {
      const { asset, usage } = await mediaService.getAsset(request.validated.params.id)

      response.json({
        success: true,
        message: 'Media asset retrieved successfully.',
        data: {
          ...serializeAdminMediaAsset(asset),
          usage,
        },
      })
    },

    update: async (request, response) => {
      const asset = await mediaService.updateAsset(request.validated.params.id, request.validated.body)

      response.json({
        success: true,
        message: 'Media asset updated successfully.',
        data: serializeAdminMediaAsset(asset),
      })
    },

    delete: async (request, response) => {
      await mediaService.deleteAsset(request.validated.params.id)

      response.json({
        success: true,
        message: 'Media asset deleted successfully.',
      })
    },
  }
}
