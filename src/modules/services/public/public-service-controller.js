import { sendCacheablePublicJson } from '../../../utils/public-response.js'
import { serializePublicService } from './public-service-serializer.js'

export function createPublicServiceController({ serviceService }) {
  return {
    list: async (request, response) => {
      const services = await serviceService.listServices(request.validated.query)

      sendCacheablePublicJson(response, {
        success: true,
        message: 'Services retrieved successfully.',
        data: services.map(serializePublicService),
      })
    },
  }
}
