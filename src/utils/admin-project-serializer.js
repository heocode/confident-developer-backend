function serializeDate(value) {
  if (value === undefined || value === null) return value
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function serializeId(value) {
  if (value === undefined || value === null) return value
  return (value._id ?? value).toString()
}

function sourceOf(project) {
  return typeof project.toObject === 'function' ? project.toObject() : project
}

export function serializeAdminProject(project) {
  const source = sourceOf(project)

  return {
    id: serializeId(source._id ?? source.id),
    slug: source.slug,
    title: source.title,
    tagline: source.tagline,
    summary: source.summary,
    scope: source.scope,
    position: source.position,
    themeColor: source.themeColor,
    status: source.status,
    timeline: source.timeline
      ? {
          startDate: serializeDate(source.timeline.startDate),
          endDate: serializeDate(source.timeline.endDate),
        }
      : source.timeline,
    home: source.home
      ? {
          featured: source.home.featured,
          primary: source.home.primary,
          order: source.home.order,
        }
      : source.home,
    projectsPageOrder: source.projectsPageOrder,
    buildBreakdown: (source.buildBreakdown ?? []).map((item) => ({
      label: item.label,
      percentage: item.percentage,
    })),
    links: (source.links ?? []).map((link) => ({
      type: link.type,
      label: link.label,
      url: link.url,
    })),
    logoAsset: serializeId(source.logoAsset),
    homePreviewAsset: serializeId(source.homePreviewAsset),
    screenshots: (source.screenshots ?? []).map((screenshot) => ({
      asset: serializeId(screenshot.asset),
      alt: screenshot.alt,
      order: screenshot.order,
    })),
    publishedAt: serializeDate(source.publishedAt),
    createdAt: serializeDate(source.createdAt),
    updatedAt: serializeDate(source.updatedAt),
  }
}
