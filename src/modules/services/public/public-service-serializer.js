function sourceOf(service) {
  return typeof service?.toObject === 'function' ? service.toObject() : service
}

function serializeId(value) {
  return (value?._id ?? value?.id ?? value).toString()
}

function serializeImage(asset, mediaService, preset) {
  const source = sourceOf(asset)
  return {
    id: serializeId(source._id ?? source.id),
    url: mediaService.createDeliveryUrl(source, preset),
    alt: source.alt,
    width: source.width,
    height: source.height,
  }
}

function serializeShowcaseAsset(asset, mediaService) {
  const source = sourceOf(asset)
  const kind = source.kind ?? 'image'
  const preset = {
    image: 'serviceShowcaseImage',
    video: 'serviceShowcaseVideo',
    animation: 'animation',
  }[kind]

  return {
    id: serializeId(source._id ?? source.id),
    kind,
    format: source.format,
    url: mediaService.createDeliveryUrl(source, preset),
    alt: source.alt,
    width: source.width ?? null,
    height: source.height ?? null,
    duration: source.duration ?? null,
    preview: source.previewAsset
      ? serializeImage(source.previewAsset, mediaService, 'serviceShowcaseImage')
      : null,
  }
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

export function serializePublicServiceDetail(service, { mediaService }) {
  const source = sourceOf(service)

  return {
    id: serializeId(source._id ?? source.id),
    slug: source.slug,
    title: source.title,
    description: source.description,
    icon: source.icon,
    tone: source.tone,
    capabilities: [...source.capabilities],
    tools: source.tools.map((tool) => ({ key: tool.key, label: tool.label })),
    relatedProjects: source.relatedProjects.map((project) => ({
      id: serializeId(project._id ?? project.id),
      slug: project.slug,
      title: project.title,
      logo: serializeImage(project.logoAsset, mediaService, 'logo'),
    })),
    showcaseAssets: source.showcaseAssets.map((asset) =>
      serializeShowcaseAsset(asset, mediaService),
    ),
  }
}
