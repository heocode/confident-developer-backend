import createError from 'http-errors'

import { MediaAsset } from '../models/media-asset.js'
import { PortfolioProject } from '../modules/projects/portfolio-project.js'

function projectUsageFilter(mediaAssetId) {
  return {
    $or: [
      { logoAsset: mediaAssetId },
      { homePreviewAsset: mediaAssetId },
      { 'screenshots.asset': mediaAssetId },
    ],
  }
}

export function createMediaService({
  mediaModel = MediaAsset,
  projectModel = PortfolioProject,
  mediaProvider,
} = {}) {
  function requireProvider(providerName) {
    if (!mediaProvider || providerName !== mediaProvider.name) {
      throw createError(400, 'Unsupported media provider')
    }
  }

  return {
    createUploadDescriptor() {
      if (!mediaProvider) throw createError(503, 'Media provider is not configured')
      return mediaProvider.createUploadDescriptor()
    },

    async registerAsset({ provider, providerAssetId, alt }) {
      requireProvider(provider)

      const existingAsset = await mediaModel.findOne({ provider, providerAssetId })
      if (existingAsset) return { asset: existingAsset, created: false }

      const metadata = await mediaProvider.getAssetMetadata(providerAssetId)

      try {
        const asset = await mediaModel.create({ ...metadata, alt })
        return { asset, created: true }
      } catch (error) {
        if (error?.code !== 11_000) throw error

        const concurrentlyCreatedAsset = await mediaModel.findOne({ provider, providerAssetId })
        if (!concurrentlyCreatedAsset) throw error
        return { asset: concurrentlyCreatedAsset, created: false }
      }
    },

    async listAssets({ page, limit, status }) {
      const filter = status ? { status } : {}
      const [items, totalItems] = await Promise.all([
        mediaModel
          .find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        mediaModel.countDocuments(filter),
      ])

      return {
        items,
        pagination: {
          page,
          limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
      }
    },

    async getAsset(mediaAssetId) {
      const asset = await mediaModel.findById(mediaAssetId)
      if (!asset) throw createError(404, 'Media asset not found')

      const projectCount = await projectModel.countDocuments(projectUsageFilter(asset._id))

      return {
        asset,
        usage: {
          inUse: projectCount > 0,
          projectCount,
        },
      }
    },

    async updateAsset(mediaAssetId, { alt }) {
      const asset = await mediaModel.findById(mediaAssetId)
      if (!asset) throw createError(404, 'Media asset not found')

      asset.alt = alt
      await asset.save()
      return asset
    },

    async deleteAsset(mediaAssetId) {
      const asset = await mediaModel.findById(mediaAssetId)
      if (!asset) throw createError(404, 'Media asset not found')

      const projectCount = await projectModel.countDocuments(projectUsageFilter(asset._id))
      if (projectCount > 0) {
        throw createError(409, 'Media asset is currently used by one or more projects')
      }

      requireProvider(asset.provider)

      if (asset.status !== 'pendingDeletion') {
        asset.status = 'pendingDeletion'
        await asset.save()
      }

      await mediaProvider.deleteAsset(asset.providerAssetId)
      await mediaModel.deleteOne({ _id: asset._id })
    },
  }
}
