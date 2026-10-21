import createError from 'http-errors'

import { SiteProfile } from '../profile/site-profile.js'
import { PortfolioProject } from '../projects/portfolio-project.js'
import { MediaAsset } from './media-asset.js'

function projectUsageFilter(mediaAssetId) {
  return {
    $or: [
      { logoAsset: mediaAssetId },
      { homePreviewAsset: mediaAssetId },
      { 'screenshots.asset': mediaAssetId },
    ],
  }
}

function effectiveKind(asset) {
  return asset.kind ?? 'image'
}

function sameId(left, right) {
  return String(left) === String(right)
}

export function createMediaService({
  mediaModel = MediaAsset,
  projectModel = PortfolioProject,
  profileModel = SiteProfile,
  mediaProvider,
} = {}) {
  function requireProvider(providerName) {
    if (!mediaProvider || providerName !== mediaProvider.name) {
      throw createError(400, 'Unsupported media provider')
    }

    return mediaProvider
  }

  async function requirePreviewAsset(previewAssetId, mediaKind, ownAssetId) {
    const requiresPreview = mediaKind === 'video' || mediaKind === 'animation'
    if (!requiresPreview) {
      if (previewAssetId) throw createError(400, 'Preview assets are supported only for motion media')
      return undefined
    }

    if (!previewAssetId) throw createError(400, 'A preview image is required for motion media')
    if (ownAssetId && sameId(previewAssetId, ownAssetId)) {
      throw createError(400, 'A media asset cannot preview itself')
    }

    const previewAsset = await mediaModel.findById(previewAssetId)
    if (!previewAsset || previewAsset.status !== 'active' || effectiveKind(previewAsset) !== 'image') {
      throw createError(400, 'Preview asset must be an active image')
    }

    return previewAsset._id
  }

  async function registerAsset(
    { provider, providerAssetId, alt, kind = 'image', previewAsset },
    getMetadata,
  ) {
    requireProvider(provider)

    const existingAsset = await mediaModel.findOne({ provider, providerAssetId })
    if (existingAsset) {
      if (effectiveKind(existingAsset) !== kind) {
        throw createError(409, 'Media asset is already registered with another kind')
      }
      return { asset: existingAsset, created: false }
    }

    const validatedPreviewAsset = await requirePreviewAsset(previewAsset, kind)
    const metadata = await getMetadata(providerAssetId, kind)

    try {
      const asset = await mediaModel.create({
        ...metadata,
        alt,
        ...(validatedPreviewAsset ? { previewAsset: validatedPreviewAsset } : {}),
      })
      return { asset, created: true }
    } catch (error) {
      if (error?.code !== 11_000) throw error

      const concurrentlyCreatedAsset = await mediaModel.findOne({ provider, providerAssetId })
      if (!concurrentlyCreatedAsset) throw error
      if (effectiveKind(concurrentlyCreatedAsset) !== kind) {
        throw createError(409, 'Media asset is already registered with another kind')
      }
      return { asset: concurrentlyCreatedAsset, created: false }
    }
  }

  async function getUsage(mediaAssetId) {
    const [projectCount, profileResumeCount, profileAvatarCount, previewForCount] = await Promise.all([
      projectModel.countDocuments(projectUsageFilter(mediaAssetId)),
      profileModel.countDocuments({ resumeAsset: mediaAssetId }),
      profileModel.countDocuments({ 'publicIdentity.avatarAsset': mediaAssetId }),
      mediaModel.countDocuments({ previewAsset: mediaAssetId }),
    ])

    return {
      inUse: projectCount + profileResumeCount + profileAvatarCount + previewForCount > 0,
      projectCount,
      profileResumeCount,
      profileAvatarCount,
      previewForCount,
    }
  }

  return {
    createDeliveryUrl(asset, preset) {
      const provider = requireProvider(asset.provider)
      return provider.createDeliveryUrl({
        secureUrl: asset.secureUrl,
        resourceType: asset.resourceType ?? 'image',
        preset,
      })
    },

    createUploadDescriptor(kind = 'image') {
      if (!mediaProvider) throw createError(503, 'Media provider is not configured')
      return mediaProvider.createUploadDescriptor(kind)
    },

    createDocumentUploadDescriptor() {
      if (!mediaProvider) throw createError(503, 'Media provider is not configured')
      return mediaProvider.createDocumentUploadDescriptor()
    },

    registerAsset(input) {
      return registerAsset(input, (providerAssetId, kind) =>
        mediaProvider.getAssetMetadata(providerAssetId, { kind }),
      )
    },

    registerDocumentAsset(input) {
      return registerAsset(
        { ...input, kind: 'document' },
        (providerAssetId) => mediaProvider.getDocumentAssetMetadata(providerAssetId),
      )
    },

    async listAssets({ page, limit, status, kind }) {
      const filter = {
        ...(status ? { status } : {}),
        ...(kind
          ? kind === 'image'
            ? { $or: [{ kind: 'image' }, { kind: { $exists: false } }] }
            : { kind }
          : {}),
      }
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

      return {
        asset,
        usage: await getUsage(asset._id),
      }
    },

    async updateAsset(mediaAssetId, { alt, previewAsset }) {
      const asset = await mediaModel.findById(mediaAssetId)
      if (!asset) throw createError(404, 'Media asset not found')

      if (alt !== undefined) asset.alt = alt
      if (previewAsset !== undefined) {
        asset.previewAsset = await requirePreviewAsset(previewAsset, effectiveKind(asset), asset._id)
      }
      await asset.save()
      return asset
    },

    async deleteAsset(mediaAssetId) {
      const asset = await mediaModel.findById(mediaAssetId)
      if (!asset) throw createError(404, 'Media asset not found')

      const usage = await getUsage(asset._id)
      if (usage.inUse) {
        throw createError(409, 'Media asset is currently in use')
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
