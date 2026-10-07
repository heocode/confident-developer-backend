function serializeDate(value) {
  if (value === undefined || value === null) return value
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function serializeId(value) {
  return (value?._id ?? value).toString()
}

function sourceOf(asset) {
  return typeof asset.toObject === 'function' ? asset.toObject() : asset
}

export function serializeAdminMediaAsset(asset) {
  const source = sourceOf(asset)

  return {
    id: serializeId(source._id ?? source.id),
    provider: source.provider,
    url: source.secureUrl,
    resourceType: source.resourceType,
    format: source.format,
    width: source.width,
    height: source.height,
    bytes: source.bytes,
    alt: source.alt,
    status: source.status,
    createdAt: serializeDate(source.createdAt),
    updatedAt: serializeDate(source.updatedAt),
  }
}
