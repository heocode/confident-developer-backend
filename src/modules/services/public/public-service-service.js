import createError from 'http-errors'

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
const PUBLIC_SERVICE_DETAIL_FIELDS = [
  ...PUBLIC_SERVICE_FIELDS,
  'capabilities',
  'tools',
  'relatedProjects',
  'showcaseAssets',
]
const PUBLIC_MEDIA_FIELDS =
  '_id provider kind secureUrl resourceType format width height duration alt previewAsset'
const PUBLIC_PROJECT_FIELDS = '_id slug title logoAsset'

function activeImageFilter() {
  return {
    status: 'active',
    $or: [{ kind: 'image' }, { kind: { $exists: false } }],
  }
}

function relatedProjectPopulation() {
  return {
    path: 'relatedProjects',
    match: { status: 'published' },
    select: PUBLIC_PROJECT_FIELDS,
    populate: {
      path: 'logoAsset',
      match: activeImageFilter(),
      select: PUBLIC_MEDIA_FIELDS,
    },
  }
}

function showcasePopulation() {
  return {
    path: 'showcaseAssets',
    match: {
      status: 'active',
      $or: [
        { kind: { $in: ['image', 'video', 'animation'] } },
        { kind: { $exists: false } },
      ],
    },
    select: PUBLIC_MEDIA_FIELDS,
    populate: {
      path: 'previewAsset',
      match: activeImageFilter(),
      select: PUBLIC_MEDIA_FIELDS,
    },
  }
}

function hasMotionPreview(asset) {
  const kind = asset?.kind ?? 'image'
  return (kind !== 'video' && kind !== 'animation') || Boolean(asset.previewAsset)
}

function hasCompleteDetail(service) {
  return (
    service?.capabilities?.length > 0 &&
    service?.tools?.length > 0 &&
    service?.showcaseAssets?.length === 5 &&
    service.showcaseAssets.every(hasMotionPreview)
  )
}

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

    async getServiceBySlug(slug) {
      const service = await serviceModel
        .findOne({ slug, status: 'published' })
        .select(PUBLIC_SERVICE_DETAIL_FIELDS.join(' '))
        .populate(relatedProjectPopulation())
        .populate(showcasePopulation())
        .lean()

      if (!hasCompleteDetail(service)) throw createError(404, 'Service not found')

      service.relatedProjects = (service.relatedProjects ?? []).filter((project) => project.logoAsset)
      if (service.relatedProjects.length === 0) throw createError(404, 'Service not found')

      return service
    },
  }
}
