import { randomUUID } from 'node:crypto'

import { v2 as cloudinary } from 'cloudinary'
import createError from 'http-errors'

import { MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION } from '../media-asset.js'

const ALLOWED_IMAGE_FORMATS = Object.freeze(['jpg', 'jpeg', 'png', 'webp', 'avif'])
const ALLOWED_DOCUMENT_FORMATS = Object.freeze(['pdf'])
const MANAGED_PUBLIC_ID_PREFIX = 'portfolio/images/'
const MANAGED_DOCUMENT_PUBLIC_ID_PREFIX = 'portfolio/documents/resume/'
const MANAGED_TAG = 'confident-developer-managed'
const SIGNATURE_TTL_SECONDS = 60 * 60
const DELIVERY_TRANSFORMATIONS = Object.freeze({
  logo: 'c_limit,w_512,h_512,f_auto,q_auto',
  homePreview: 'c_limit,w_1600,h_1200,f_auto,q_auto',
  screenshot: 'c_limit,w_2000,h_2000,f_auto,q_auto',
  resumeDownload: 'fl_attachment:Vadim-Iskakov-Resume',
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

function createDeliveryUrl(secureUrl, preset) {
  const transformation = DELIVERY_TRANSFORMATIONS[preset]
  if (!transformation) throw createError(500, 'Media delivery preset is not configured')

  const url = new URL(secureUrl)
  const uploadPath = '/image/upload/'
  const uploadPosition = url.pathname.indexOf(uploadPath)

  if (url.protocol !== 'https:' || uploadPosition === -1) {
    throw createError(500, 'Media delivery URL is invalid')
  }

  const transformationPosition = uploadPosition + uploadPath.length
  url.pathname = `${url.pathname.slice(0, transformationPosition)}${transformation}/${url.pathname.slice(
    transformationPosition,
  )}`

  return url.toString()
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

  function createUploadDescriptor({ formats, publicIdPrefix, maxBytes }) {
    requireConfiguration()

    const issuedAt = now()
    const timestamp = Math.floor(issuedAt.getTime() / 1_000)
    const publicId = `${publicIdPrefix}${createId()}`
    const parameters = {
      allowed_formats: formats,
      overwrite: false,
      public_id: publicId,
      tags: [MANAGED_TAG],
      timestamp,
    }
    const signature = client.utils.api_sign_request(parameters, configuration.apiSecret)

    return {
      provider: 'cloudinary',
      upload: {
        method: 'POST',
        url: `https://api.cloudinary.com/v1_1/${encodeURIComponent(configuration.cloudName)}/image/upload`,
        fields: {
          api_key: configuration.apiKey,
          allowed_formats: formats.join(','),
          overwrite: 'false',
          public_id: publicId,
          signature,
          tags: MANAGED_TAG,
          timestamp,
        },
      },
      constraints: { formats: [...formats], maxBytes },
      expiresAt: new Date(issuedAt.getTime() + SIGNATURE_TTL_SECONDS * 1_000),
    }
  }

  async function getManagedAssetMetadata(providerAssetId, { formats, kind, publicIdPrefix }) {
    requireConfiguration()

    let resource

    try {
      resource = await client.api.resource_by_asset_id(providerAssetId, { tags: true })
    } catch (error) {
      if (isNotFoundError(error)) throw createError(404, 'Uploaded media asset was not found')
      throw providerError()
    }

    const isManaged =
      resource.asset_id === providerAssetId &&
      resource.resource_type === 'image' &&
      resource.type === 'upload' &&
      resource.public_id?.startsWith(publicIdPrefix) &&
      resource.tags?.includes(MANAGED_TAG)

    if (!isManaged) {
      throw createError(400, 'Uploaded media asset was not created by this application')
    }

    if (!formats.includes(resource.format)) {
      throw createError(400, `Uploaded ${kind} format is not supported`)
    }

    if (kind === 'document' && resource.bytes > MAX_DOCUMENT_BYTES) {
      throw createError(400, 'Uploaded document exceeds the maximum file size')
    }

    return {
      kind,
      provider: 'cloudinary',
      providerAssetId: resource.asset_id,
      secureUrl: resource.secure_url,
      resourceType: resource.resource_type,
      format: resource.format,
      width: resource.width,
      height: resource.height,
      bytes: resource.bytes,
    }
  }

  return {
    name: 'cloudinary',
    isConfigured: Boolean(configuration),

    createDeliveryUrl({ secureUrl, preset }) {
      return createDeliveryUrl(secureUrl, preset)
    },

    createUploadDescriptor() {
      const descriptor = createUploadDescriptor({
        formats: ALLOWED_IMAGE_FORMATS,
        publicIdPrefix: MANAGED_PUBLIC_ID_PREFIX,
        maxBytes: MAX_IMAGE_BYTES,
      })
      descriptor.constraints.maxWidth = MAX_IMAGE_DIMENSION
      descriptor.constraints.maxHeight = MAX_IMAGE_DIMENSION
      return descriptor
    },

    createDocumentUploadDescriptor() {
      return createUploadDescriptor({
        formats: ALLOWED_DOCUMENT_FORMATS,
        publicIdPrefix: MANAGED_DOCUMENT_PUBLIC_ID_PREFIX,
        maxBytes: MAX_DOCUMENT_BYTES,
      })
    },

    async getAssetMetadata(providerAssetId) {
      return getManagedAssetMetadata(providerAssetId, {
        formats: ALLOWED_IMAGE_FORMATS,
        kind: 'image',
        publicIdPrefix: MANAGED_PUBLIC_ID_PREFIX,
      })
    },

    async getDocumentAssetMetadata(providerAssetId) {
      return getManagedAssetMetadata(providerAssetId, {
        formats: ALLOWED_DOCUMENT_FORMATS,
        kind: 'document',
        publicIdPrefix: MANAGED_DOCUMENT_PUBLIC_ID_PREFIX,
      })
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
