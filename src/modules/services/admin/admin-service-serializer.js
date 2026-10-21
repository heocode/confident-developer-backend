function serializeDate(value) {
  if (value === undefined || value === null) return value
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function serializeId(value) {
  return (value?._id ?? value?.id ?? value).toString()
}

function sourceOf(service) {
  return typeof service.toObject === 'function' ? service.toObject() : service
}

export function serializeAdminService(service) {
  const source = sourceOf(service)

  return {
    id: serializeId(source._id ?? source.id),
    slug: source.slug,
    title: source.title,
    description: source.description,
    icon: source.icon,
    tone: source.tone,
    capabilities: [...(source.capabilities ?? [])],
    tools: (source.tools ?? []).map((tool) => ({ key: tool.key, label: tool.label })),
    relatedProjects: (source.relatedProjects ?? []).map(serializeId),
    showcaseAssets: (source.showcaseAssets ?? []).map(serializeId),
    status: source.status,
    home: source.home
      ? {
          featured: source.home.featured,
          order: source.home.order,
        }
      : source.home,
    servicesPageOrder: source.servicesPageOrder,
    publishedAt: serializeDate(source.publishedAt),
    createdAt: serializeDate(source.createdAt),
    updatedAt: serializeDate(source.updatedAt),
  }
}
