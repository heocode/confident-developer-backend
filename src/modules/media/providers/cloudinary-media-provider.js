import { randomUUID } from 'node:crypto'

import { v2 as cloudinary } from 'cloudinary'
import createError from 'http-errors'

import {
  MAX_ANIMATION_BYTES,
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DIMENSION,
  MAX_VIDEO_DURATION_SECONDS,
} from '../media-asset.js'

const MANAGED_TAG = 'confident-developer-managed'
const SIGNATURE_TTL_SECONDS = 60 * 60
const UPLOAD_POLICIES = Object.freeze({
  image: {
    formats: ['jpg', 'jpeg', 'png', 'webp', 'avif'],
    resourceType: 'image',
    publicIdPrefix: 'portfolio/images/',
    maxBytes: MAX_IMAGE_BYTES,
    maxWidth: MAX_IMAGE_DIMENSION,
    maxHeight: MAX_IMAGE_DIMENSION,
  },
  video: {
    formats: ['mp4'],
    resourceType: 'video',
    publicIdPrefix: 'portfolio/videos/',
    maxBytes: MAX_VIDEO_BYTES,
    maxWidth: MAX_VIDEO_DIMENSION,
    maxHeight: MAX_VIDEO_DIMENSION,
    maxDurationSeconds: MAX_VIDEO_DURATION_SECONDS,
  },
  animation: {
    formats: ['riv'],
    resourceType: 'raw',
    publicIdPrefix: 'portfolio/animations/',
    publicIdExtension: '.riv',
    maxBytes: MAX_ANIMATION_BYTES,
  },
  document: {
    formats: ['pdf'],
    resourceType: 'image',
    publicIdPrefix: 'portfolio/documents/resume/',
    maxBytes: MAX_DOCUMENT_BYTES,
  },
})
const DELIVERY_TRANSFORMATIONS = Object.freeze({
  avatar: { resourceType: 'image', value: 'c_fill,w_256,h_256,g_face,f_auto,q_auto' },
  logo: { resourceType: 'image', value: 'c_limit,w_512,h_512,f_auto,q_auto' },
  homePreview: { resourceType: 'image', value: 'c_limit,w_1600,h_1200,f_auto,q_auto' },
  screenshot: { resourceType: 'image', value: 'c_limit,w_2000,h_2000,f_auto,q_auto' },
  serviceShowcaseImage: { resourceType: 'image', value: 'c_limit,w_1600,h_1600,f_auto,q_auto' },
  serviceShowcaseVideo: {
    resourceType: 'video',
    value: 'c_limit,w_1280,h_1280,f_auto:video,q_auto',
  },
  resumeDownload: { resourceType: 'image', value: 'fl_attachment:Vadim-Iskakov-Resume' },
})

function unavailableError() {
  return createError(503, 'Media provider is not configured')
}

function providerError() {
  return createError(502, 'Media provider request failed')
}

function isNotFoundError(error) {
  return error?.http_code === 404 || error?.error?.http_code === 404
}

function createDeliveryUrl({ secureUrl, preset, resourceType = 'image' }) {
  if (preset === 'animation') {
    const url = new URL(secureUrl)
    if (url.protocol !== 'https:' || !url.pathname.includes('/raw/upload/')) {
      throw createError(500, 'Media delivery URL is invalid')
    }
    return url.toString()
  }

  const delivery = DELIVERY_TRANSFORMATIONS[preset]
  if (!delivery || delivery.resourceType !== resourceType) {
    throw createError(500, 'Media delivery preset is not configured')
  }

  const url = new URL(secureUrl)
  const uploadPath = `/${resourceType}/upload/`
  const uploadPosition = url.pathname.indexOf(uploadPath)

  if (url.protocol !== 'https:' || uploadPosition === -1) {
    throw createError(500, 'Media delivery URL is invalid')
  }

  const transformationPosition = uploadPosition + uploadPath.length
  url.pathname = `${url.pathname.slice(0, transformationPosition)}${delivery.value}/${url.pathname.slice(
    transformationPosition,
  )}`

  return url.toString()
}

function getResourceFormat(resource, policy) {
  if (policy.resourceType === 'raw') {
    return policy.formats.find((format) => resource.public_id?.toLowerCase().endsWith(`.${format}`))
  }
  return resource.format?.toLowerCase()
}

function validateProviderLimits(resource, kind, policy) {
  if (!Number.isInteger(resource.bytes) || resource.bytes < 1 || resource.bytes > policy.maxBytes) {
    throw createError(400, `Uploaded ${kind} exceeds the maximum file size`)
  }

  if (
    policy.maxWidth &&
    (!Number.isInteger(resource.width) || resource.width < 1 || resource.width > policy.maxWidth)
  ) {
    throw createError(400, `Uploaded ${kind} width is invalid`)
  }
  if (
    policy.maxHeight &&
    (!Number.isInteger(resource.height) || resource.height < 1 || resource.height > policy.maxHeight)
  ) {
    throw createError(400, `Uploaded ${kind} height is invalid`)
  }
  if (
    policy.maxDurationSeconds &&
    (!Number.isFinite(resource.duration) ||
      resource.duration <= 0 ||
      resource.duration > policy.maxDurationSeconds)
  ) {
    throw createError(400, `Uploaded ${kind} duration is invalid`)
  }
}

export function createCloudinaryMediaProvider(
  configuration,
  { client = cloudinary, now = () => new Date(), createId = randomUUID } = {},
) {
  if (configuration) {
    client.config({
      cloud_name: configuration.cloudName,
      api_key: configuration.apiKey,
      api_secret: configuration.apiSecret,
      secure: true,
      signature_algorithm: 'sha256',
    })
  }

  function requireConfiguration() {
    if (!configuration) throw unavailableError()
  }

  function createUploadDescriptor(kind) {
    requireConfiguration()
    const policy = UPLOAD_POLICIES[kind]
    if (!policy || kind === 'document') throw createError(400, 'Unsupported media kind')

    const issuedAt = now()
    const timestamp = Math.floor(issuedAt.getTime() / 1_000)
    const publicId = `${policy.publicIdPrefix}${createId()}${policy.publicIdExtension ?? ''}`
    const parameters = {
      allowed_formats: policy.formats,
      overwrite: false,
      public_id: publicId,
      tags: [MANAGED_TAG],
      timestamp,
    }
    const signature = client.utils.api_sign_request(parameters, configuration.apiSecret)

    return {
      provider: 'cloudinary',
      kind,
      upload: {
        method: 'POST',
        url: `https://api.cloudinary.com/v1_1/${encodeURIComponent(configuration.cloudName)}/${policy.resourceType}/upload`,
        fields: {
          api_key: configuration.apiKey,
          allowed_formats: policy.formats.join(','),
          overwrite: 'false',
          public_id: publicId,
          signature,
          tags: MANAGED_TAG,
          timestamp,
        },
      },
      constraints: {
        formats: [...policy.formats],
        maxBytes: policy.maxBytes,
        ...(policy.maxWidth ? { maxWidth: policy.maxWidth } : {}),
        ...(policy.maxHeight ? { maxHeight: policy.maxHeight } : {}),
        ...(policy.maxDurationSeconds ? { maxDurationSeconds: policy.maxDurationSeconds } : {}),
      },
      expiresAt: new Date(issuedAt.getTime() + SIGNATURE_TTL_SECONDS * 1_000),
    }
  }

  function createDocumentUploadDescriptor() {
    requireConfiguration()
    const policy = UPLOAD_POLICIES.document
    const issuedAt = now()
    const timestamp = Math.floor(issuedAt.getTime() / 1_000)
    const publicId = `${policy.publicIdPrefix}${createId()}`
    const parameters = {
      allowed_formats: policy.formats,
      overwrite: false,
      public_id: publicId,
      tags: [MANAGED_TAG],
      timestamp,
    }
    const signature = client.utils.api_sign_request(parameters, configuration.apiSecret)

    return {
      provider: 'cloudinary',
      kind: 'document',
      upload: {
        method: 'POST',
        url: `https://api.cloudinary.com/v1_1/${encodeURIComponent(configuration.cloudName)}/image/upload`,
        fields: {
          api_key: configuration.apiKey,
          allowed_formats: policy.formats.join(','),
          overwrite: 'false',
          public_id: publicId,
          signature,
          tags: MANAGED_TAG,
          timestamp,
        },
      },
      constraints: { formats: [...policy.formats], maxBytes: policy.maxBytes },
      expiresAt: new Date(issuedAt.getTime() + SIGNATURE_TTL_SECONDS * 1_000),
    }
  }

  async function getManagedAssetMetadata(providerAssetId, kind) {
    requireConfiguration()
    const policy = UPLOAD_POLICIES[kind]
    if (!policy) throw createError(400, 'Unsupported media kind')

    let resource
    try {
      resource = await client.api.resource_by_asset_id(providerAssetId, { tags: true })
    } catch (error) {
      if (isNotFoundError(error)) throw createError(404, 'Uploaded media asset was not found')
      throw providerError()
    }

    const isManaged =
      resource.asset_id === providerAssetId &&
      resource.resource_type === policy.resourceType &&
      resource.type === 'upload' &&
      resource.public_id?.startsWith(policy.publicIdPrefix) &&
      (!policy.publicIdExtension || resource.public_id.endsWith(policy.publicIdExtension)) &&
      resource.tags?.includes(MANAGED_TAG) &&
      typeof resource.secure_url === 'string' &&
      resource.secure_url.startsWith('https://')

    if (!isManaged) throw createError(400, 'Uploaded media asset was not created by this application')

    const format = getResourceFormat(resource, policy)
    if (!policy.formats.includes(format)) throw createError(400, `Uploaded ${kind} format is not supported`)
    validateProviderLimits(resource, kind, policy)

    return {
      kind,
      provider: 'cloudinary',
      providerAssetId: resource.asset_id,
      secureUrl: resource.secure_url,
      resourceType: resource.resource_type,
      format,
      ...(resource.width != null ? { width: resource.width } : {}),
      ...(resource.height != null ? { height: resource.height } : {}),
      ...(resource.duration != null ? { duration: resource.duration } : {}),
      bytes: resource.bytes,
    }
  }

  return {
    name: 'cloudinary',
    isConfigured: Boolean(configuration),

    createDeliveryUrl,

    createUploadDescriptor(kind = 'image') {
      return createUploadDescriptor(kind)
    },

    createDocumentUploadDescriptor,

    async getAssetMetadata(providerAssetId, { kind = 'image' } = {}) {
      if (kind === 'document') throw createError(400, 'Unsupported media kind')
      return getManagedAssetMetadata(providerAssetId, kind)
    },

    async getDocumentAssetMetadata(providerAssetId) {
      return getManagedAssetMetadata(providerAssetId, 'document')
    },

    async deleteAsset(providerAssetId) {
      requireConfiguration()

      let result
      try {
        result = await client.api.delete_resources_by_asset_ids([providerAssetId], { invalidate: true })
      } catch {
        throw providerError()
      }

      const deletionStatuses = Object.values(result.deleted ?? {})
      if (deletionStatuses.length !== 1 || !['deleted', 'not_found'].includes(deletionStatuses[0])) {
        throw providerError()
      }
    },
  }
}
