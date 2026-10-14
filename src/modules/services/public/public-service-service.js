import { PortfolioService } from '../portfolio-service.js'

const PUBLIC_SERVICE_FIELDS = [
  '_id',
  'slug',
  'title',
  'description',
  'icon',
  'tone',
  'home.featured',
]

export function createPublicServiceService({ serviceModel = PortfolioService } = {}) {
  return {
    async listServices({ placement } = {}) {
      const isHomePlacement = placement === 'home'
      const filter = {
        status: 'published',
        ...(isHomePlacement ? { 'home.featured': true } : {}),
      }
      const sort = isHomePlacement
        ? { 'home.order': 1, _id: 1 }
        : { servicesPageOrder: 1, _id: 1 }

      return serviceModel.find(filter).select(PUBLIC_SERVICE_FIELDS.join(' ')).sort(sort).lean()
    },
  }
}
