function sourceOf(value) {
  return typeof value?.toObject === 'function' ? value.toObject() : value
}

export function serializePublicProfileIdentity({ profile, asset, avatarUrl }) {
  const profileSource = sourceOf(profile)
  const assetSource = sourceOf(asset)

  return {
    displayName: profileSource.publicIdentity.displayName,
    handle: profileSource.publicIdentity.handle,
    avatar: {
      url: avatarUrl,
      alt: assetSource.alt,
    },
  }
}
