import { serializeAdminService } from './admin-service-serializer.js'

export function createAdminServiceController({ serviceService }) {
  return {
    create: async (request, response) => {
      const service = await serviceService.createService(request.validated.body)

      response.status(201).json({
        success: true,
        message: 'Service created successfully.',
        data: serializeAdminService(service),
      })
    },

    list: async (request, response) => {
      const services = await serviceService.listServices(request.validated.query)

      response.json({
        success: true,
        message: 'Services retrieved successfully.',
        data: services.map(serializeAdminService),
      })
    },

    getById: async (request, response) => {
      const service = await serviceService.getService(request.validated.params.id)

      response.json({
        success: true,
        message: 'Service retrieved successfully.',
        data: serializeAdminService(service),
      })
    },

    update: async (request, response) => {
      const service = await serviceService.updateService(
        request.validated.params.id,
        request.validated.body,
      )

      response.json({
        success: true,
        message: 'Service updated successfully.',
        data: serializeAdminService(service),
      })
    },

    delete: async (request, response) => {
      await serviceService.deleteService(request.validated.params.id)

      response.json({
        success: true,
        message: 'Service deleted successfully.',
      })
    },
  }
}
