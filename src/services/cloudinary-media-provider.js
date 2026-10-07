import { randomUUID } from 'node:crypto'

import { v2 as cloudinary } from 'cloudinary'
import createError from 'http-errors'

import { MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION } from '../models/media-asset.js'

const ALLOWED_IMAGE_FORMATS = Object.freeze(['jpg', 'jpeg', 'png', 'webp', 'avif'])
const MANAGED_PUBLIC_ID_PREFIX = 'portfolio/images/'
const MANAGED_TAG = 'confident-developer-managed'
const SIGNATURE_TTL_SECONDS = 60 * 60

function unavailableError() {
  return createError(503, 'Media provider is not configured')
}

function providerError() {
  return createError(502, 'Media provider request failed')
}

function isNotFoundError(error) {
  return error?.http_code === 404 || error?.error?.http_code === 404
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

  return {
    name: 'cloudinary',
    isConfigured: Boolean(configuration),

    createUploadDescriptor() {
      requireConfiguration()

      const issuedAt = now()
      const timestamp = Math.floor(issuedAt.getTime() / 1_000)
      const publicId = `${MANAGED_PUBLIC_ID_PREFIX}${createId()}`
      const parameters = {
        allowed_formats: ALLOWED_IMAGE_FORMATS,
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
            allowed_formats: ALLOWED_IMAGE_FORMATS.join(','),
            overwrite: 'false',
            public_id: publicId,
            signature,
            tags: MANAGED_TAG,
            timestamp,
          },
        },
        constraints: {
          formats: [...ALLOWED_IMAGE_FORMATS],
          maxBytes: MAX_IMAGE_BYTES,
          maxWidth: MAX_IMAGE_DIMENSION,
          maxHeight: MAX_IMAGE_DIMENSION,
        },
        expiresAt: new Date(issuedAt.getTime() + SIGNATURE_TTL_SECONDS * 1_000),
      }
    },

    async getAssetMetadata(providerAssetId) {
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
        resource.public_id?.startsWith(MANAGED_PUBLIC_ID_PREFIX) &&
        resource.tags?.includes(MANAGED_TAG)

      if (!isManaged) {
        throw createError(400, 'Uploaded media asset was not created by this application')
      }

      if (!ALLOWED_IMAGE_FORMATS.includes(resource.format)) {
        throw createError(400, 'Uploaded image format is not supported')
      }

      return {
        provider: 'cloudinary',
        providerAssetId: resource.asset_id,
        secureUrl: resource.secure_url,
        resourceType: resource.resource_type,
        format: resource.format,
        width: resource.width,
        height: resource.height,
        bytes: resource.bytes,
      }
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
