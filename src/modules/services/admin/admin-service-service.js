import mongoose from 'mongoose'
import createError from 'http-errors'

import { MediaAsset } from '../../media/media-asset.js'
import { PortfolioProject } from '../../projects/portfolio-project.js'
import { PortfolioService } from '../portfolio-service.js'

const MAX_PUBLISHED_HOME_SERVICES = 4

async function runInMongoTransaction(operation) {
  const session = await mongoose.startSession()

  try {
    return await session.withTransaction(() => operation(session))
  } finally {
    await session.endSession()
  }
}

function useSession(query, session) {
  return session && typeof query?.session === 'function' ? query.session(session) : query
}

function documentValue(value) {
  return typeof value?.toObject === 'function' ? value.toObject() : value
}

function applyServicePatch(service, patch) {
  const { home, ...fields } = patch
  service.set(fields)

  if (Object.hasOwn(patch, 'home')) {
    service.set('home', { ...(documentValue(service.home) ?? {}), ...home })
  }
}

export function createAdminServiceService({
  serviceModel = PortfolioService,
  projectModel = PortfolioProject,
  mediaAssetModel = MediaAsset,
  runInTransaction = runInMongoTransaction,
  now = () => new Date(),
} = {}) {
  async function validateRelatedProjects(service, session) {
    if (service.relatedProjects.length === 0) return

    const projectIds = service.relatedProjects.map((id) => id.toString())
    const query = projectModel.countDocuments({ _id: { $in: projectIds } })
    const projectCount = await useSession(query, session)

    if (projectCount !== projectIds.length) {
      throw createError(409, 'One or more related projects are missing')
    }
  }

  async function validateShowcaseAssets(service, session) {
    if (service.showcaseAssets.length === 0) return

    const mediaAssetIds = service.showcaseAssets.map((id) => id.toString())
    const query = mediaAssetModel.countDocuments({
      _id: { $in: mediaAssetIds },
      status: 'active',
      $or: [
        { kind: { $in: ['image', 'video', 'animation'] } },
        { kind: { $exists: false } },
      ],
    })
    const mediaAssetCount = await useSession(query, session)

    if (mediaAssetCount !== mediaAssetIds.length) {
      throw createError(409, 'One or more showcase media assets are missing, inactive, or unsupported')
    }
  }

  async function validateAndSave(service, session) {
    if (service.status === 'published' && !service.publishedAt) service.publishedAt = now()

    await service.validate()
    await validateRelatedProjects(service, session)
    await validateShowcaseAssets(service, session)

    if (service.status === 'published' && service.home.featured) {
      const query = serviceModel.countDocuments({
        _id: { $ne: service._id },
        status: 'published',
        'home.featured': true,
      })
      const otherHomeServices = await useSession(query, session)

      if (otherHomeServices >= MAX_PUBLISHED_HOME_SERVICES) {
        throw createError(409, `Home cannot contain more than ${MAX_PUBLISHED_HOME_SERVICES} services`)
      }
    }

    await service.save({ session })
    return service
  }

  return {
    async createService(input) {
      return runInTransaction(async (session) => {
        const service = new serviceModel(input)
        return validateAndSave(service, session)
      })
    },

    async listServices({ status } = {}) {
      const filter = status ? { status } : {}
      return serviceModel.find(filter).sort({ createdAt: -1, _id: -1 })
    },

    async getService(serviceId) {
      const service = await serviceModel.findById(serviceId)
      if (!service) throw createError(404, 'Service not found')
      return service
    },

    async updateService(serviceId, input) {
      return runInTransaction(async (session) => {
        const service = await useSession(serviceModel.findById(serviceId), session)
        if (!service) throw createError(404, 'Service not found')

        applyServicePatch(service, input)
        return validateAndSave(service, session)
      })
    },

    async deleteService(serviceId) {
      const service = await serviceModel.findByIdAndDelete(serviceId)
      if (!service) throw createError(404, 'Service not found')
    },
  }
}
