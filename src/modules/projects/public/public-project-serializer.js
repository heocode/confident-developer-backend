function sourceOf(value) {
  return typeof value?.toObject === 'function' ? value.toObject() : value
}

function serializeId(value) {
  if (value === undefined || value === null) return value
  return (value._id ?? value.id ?? value).toString()
}

function serializeDate(value) {
  if (value === undefined || value === null) return value
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function serializeMedia(asset, { alt, id, mediaService, preset }) {
  if (!asset) return null
  const source = sourceOf(asset)

  return {
    id: serializeId(id ?? source._id ?? source.id),
    url: mediaService.createDeliveryUrl(source, preset),
    alt: alt ?? source.alt,
    width: source.width,
    height: source.height,
  }
}

export function serializePublicProject(project, { includeDetails = false, mediaService }) {
  const source = sourceOf(project)
  const serialized = {
    id: serializeId(source._id ?? source.id),
    slug: source.slug,
    title: source.title,
    tagline: source.tagline,
    summary: source.summary,
    position: source.position,
    themeColor: source.themeColor ?? null,
    timeline: {
      startDate: serializeDate(source.timeline.startDate),
      endDate: serializeDate(source.timeline.endDate),
    },
    home: {
      featured: source.home.featured,
      primary: source.home.primary,
    },
    buildBreakdown: (source.buildBreakdown ?? []).map((item) => ({
      id: serializeId(item._id ?? item.id),
      label: item.label,
      percentage: item.percentage,
    })),
    logo: serializeMedia(source.logoAsset, { mediaService, preset: 'logo' }),
    homePreview: serializeMedia(source.homePreviewAsset, { mediaService, preset: 'homePreview' }),
    links: (source.links ?? []).map((link) => ({
      id: serializeId(link._id ?? link.id),
      label: link.label,
      url: link.url,
      icon: link.icon,
    })),
  }

  if (includeDetails) {
    serialized.scope = source.scope
    serialized.screenshots = (source.screenshots ?? []).map((screenshot) =>
      serializeMedia(screenshot.asset, {
        alt: screenshot.alt,
        id: screenshot._id ?? screenshot.id,
        mediaService,
        preset: 'screenshot',
      }),
    )
  }

  return serialized
}
