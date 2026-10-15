import { RESUME_FILE_NAME } from '../profile-service.js'

function serializeDate(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function sourceOf(value) {
  return typeof value?.toObject === 'function' ? value.toObject() : value
}

export function serializeAdminResume({ profile, asset }) {
  const profileSource = sourceOf(profile)
  const assetSource = sourceOf(asset)

  return {
    id: (assetSource._id ?? assetSource.id).toString(),
    fileName: RESUME_FILE_NAME,
    format: assetSource.format,
    bytes: assetSource.bytes,
    url: assetSource.secureUrl,
    contentUpdatedAt: serializeDate(profileSource.updatedAt),
  }
}

export function serializeAdminProfileIdentity({ profile, asset, avatarUrl }) {
  const profileSource = sourceOf(profile)
  const assetSource = sourceOf(asset)

  return {
    displayName: profileSource.publicIdentity.displayName,
    handle: profileSource.publicIdentity.handle,
    avatar: {
      id: (assetSource._id ?? assetSource.id).toString(),
      url: avatarUrl,
      alt: assetSource.alt,
    },
    contentUpdatedAt: serializeDate(profileSource.updatedAt),
  }
}
