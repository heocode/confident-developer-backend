function sourceOf(service) {
  return typeof service?.toObject === 'function' ? service.toObject() : service
}

function serializeId(value) {
  return (value?._id ?? value?.id ?? value).toString()
}

export function serializePublicService(service) {
  const source = sourceOf(service)

  return {
    id: serializeId(source._id ?? source.id),
    slug: source.slug,
    title: source.title,
    description: source.description,
    icon: source.icon,
    tone: source.tone,
    home: {
      featured: source.home.featured,
    },
  }
}
