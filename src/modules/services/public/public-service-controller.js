import { sendCacheablePublicJson } from '../../../utils/public-response.js'
import {
  serializePublicService,
  serializePublicServiceDetail,
} from './public-service-serializer.js'

export function createPublicServiceController({ serviceService, mediaService }) {
  return {
    list: async (request, response) => {
      const services = await serviceService.listServices(request.validated.query)

      sendCacheablePublicJson(response, {
        success: true,
        message: 'Services retrieved successfully.',
        data: services.map(serializePublicService),
      })
    },

    getBySlug: async (request, response) => {
      const service = await serviceService.getServiceBySlug(request.validated.params.slug)

      sendCacheablePublicJson(response, {
        success: true,
        message: 'Service retrieved successfully.',
        data: serializePublicServiceDetail(service, { mediaService }),
      })
    },
  }
}
