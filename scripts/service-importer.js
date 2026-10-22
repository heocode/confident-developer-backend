import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

import {
  MAX_ANIMATION_BYTES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DIMENSION,
  MAX_VIDEO_DURATION_SECONDS,
} from '../src/modules/media/media-asset.js'
import { createAdminServiceBodySchema } from '../src/modules/services/admin/admin-service-schemas.js'

const execFileAsync = promisify(execFile)
const SERVICE_ASSET_ROOT = 'makets/service-assets'
const PNG_SIGNATURE = '89504e470d0a1a0a'
const ASSET_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PROJECT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const IMPORT_STATE_VERSION = 1

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readPngDimensions(buffer, path) {
  assert(buffer.length >= 24, `Asset is not a valid PNG: ${path}`)
  assert(buffer.subarray(0, 8).toString('hex') === PNG_SIGNATURE, `Asset must be a PNG: ${path}`)
  assert(buffer.subarray(12, 16).toString('ascii') === 'IHDR', `Asset is missing a PNG header: ${path}`)
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: 'png' }
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)
}

function readWebpDimensions(buffer, path) {
  assert(buffer.length >= 30, `Asset is not a valid WebP image: ${path}`)
  assert(buffer.subarray(0, 4).toString('ascii') === 'RIFF', `Asset must be a WebP image: ${path}`)
  assert(buffer.subarray(8, 12).toString('ascii') === 'WEBP', `Asset must be a WebP image: ${path}`)

  const chunk = buffer.subarray(12, 16).toString('ascii')
  if (chunk === 'VP8X') {
    return {
      width: readUInt24LE(buffer, 24) + 1,
      height: readUInt24LE(buffer, 27) + 1,
      format: 'webp',
    }
  }
  if (chunk === 'VP8 ') {
    assert(
      buffer.length >= 30 && buffer.subarray(23, 26).toString('hex') === '9d012a',
      `Asset has an invalid WebP frame: ${path}`,
    )
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
      format: 'webp',
    }
  }
  if (chunk === 'VP8L') {
    assert(buffer.length >= 25 && buffer[20] === 0x2f, `Asset has an invalid WebP frame: ${path}`)
    return {
      width: 1 + buffer[21] + ((buffer[22] & 0x3f) << 8),
      height: 1 + ((buffer[22] & 0xc0) >> 6) + (buffer[23] << 2) + ((buffer[24] & 0x0f) << 10),
      format: 'webp',
    }
  }

  throw new Error(`Asset uses an unsupported WebP encoding: ${path}`)
}

function readImageDimensions(buffer, path) {
  const extension = extname(path).toLowerCase()
  if (extension === '.png') return readPngDimensions(buffer, path)
  if (extension === '.webp') return readWebpDimensions(buffer, path)
  throw new Error(`Local service images must use PNG or WebP: ${path}`)
}

function validateImageDimensions({ width, height }, path) {
  assert(width > 0 && width <= MAX_IMAGE_DIMENSION, `Asset width is invalid: ${path}`)
  assert(height > 0 && height <= MAX_IMAGE_DIMENSION, `Asset height is invalid: ${path}`)
}

function validateRive(buffer, path) {
  assert(buffer.length >= 8, `Asset is not a valid Rive file: ${path}`)
  assert(buffer.subarray(0, 4).toString('ascii') === 'RIVE', `Asset must be a Rive file: ${path}`)
  assert(extname(path).toLowerCase() === '.riv', `Rive assets must use the .riv extension: ${path}`)
}

function validateMp4(buffer, path) {
  assert(buffer.length >= 12, `Asset is not a valid MP4 file: ${path}`)
  assert(buffer.subarray(4, 8).toString('ascii') === 'ftyp', `Asset must be an MP4 file: ${path}`)
  assert(extname(path).toLowerCase() === '.mp4', `Video assets must use the .mp4 extension: ${path}`)
}

async function inspectVideoWithFfprobe(absolutePath) {
  let stdout
  try {
    const result = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name,width,height,duration:format=duration',
      '-of',
      'json',
      absolutePath,
    ])
    stdout = result.stdout
  } catch {
    throw new Error('ffprobe is required to validate service video assets')
  }

  const result = JSON.parse(stdout)
  const stream = result.streams?.[0]
  assert(stream, `Video has no readable video stream: ${absolutePath}`)
  return {
    codec: stream.codec_name,
    width: Number(stream.width),
    height: Number(stream.height),
    duration: Number(stream.duration ?? result.format?.duration),
  }
}

function resolveAssetPath(workspaceRoot, assetPath) {
  assert(typeof assetPath === 'string' && assetPath.length > 0, 'Asset path is required')
  assert(!isAbsolute(assetPath), `Asset path must be relative: ${assetPath}`)

  const assetRoot = resolve(workspaceRoot, SERVICE_ASSET_ROOT)
  const absolutePath = resolve(workspaceRoot, assetPath)
  const relativePath = relative(assetRoot, absolutePath)
  assert(
    relativePath !== '' && relativePath !== '..' && !relativePath.startsWith('../') && !isAbsolute(relativePath),
    `Asset path must stay inside ${SERVICE_ASSET_ROOT}: ${assetPath}`,
  )
  return absolutePath
}

function validateAlt(alt, key) {
  assert(typeof alt === 'string' && alt.trim().length > 0, `Asset alt text is required for ${key}`)
  assert(alt.length <= 300, `Asset alt text is too long for ${key}`)
  return alt.trim()
}

async function inspectAsset(
  descriptor,
  { key, role, workspaceRoot, absolutePaths, inspectVideo },
) {
  const absolutePath = resolveAssetPath(workspaceRoot, descriptor.path)
  assert(!absolutePaths.has(absolutePath), `Multiple assets reference the same file: ${descriptor.path}`)
  absolutePaths.add(absolutePath)

  let metadata
  try {
    metadata = await stat(absolutePath)
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Asset file is missing: ${descriptor.path}`)
    throw error
  }
  assert(metadata.isFile(), `Asset is not a file: ${descriptor.path}`)
  assert(metadata.size > 0, `Asset is empty: ${descriptor.path}`)

  const contents = await readFile(absolutePath)
  const common = {
    key,
    role,
    kind: descriptor.kind,
    path: descriptor.path,
    absolutePath,
    filename: basename(descriptor.path),
    alt: validateAlt(descriptor.alt, key),
    bytes: metadata.size,
    sha256: createHash('sha256').update(contents).digest('hex'),
  }

  if (descriptor.kind === 'image') {
    assert(metadata.size <= MAX_IMAGE_BYTES, `Image exceeds the byte limit: ${descriptor.path}`)
    const dimensions = readImageDimensions(contents, descriptor.path)
    validateImageDimensions(dimensions, descriptor.path)
    return { ...common, ...dimensions }
  }

  if (descriptor.kind === 'animation') {
    assert(metadata.size <= MAX_ANIMATION_BYTES, `Animation exceeds the byte limit: ${descriptor.path}`)
    validateRive(contents, descriptor.path)
    return { ...common, format: 'riv' }
  }

  assert(descriptor.kind === 'video', `Unsupported service media kind: ${descriptor.kind}`)
  assert(metadata.size <= MAX_VIDEO_BYTES, `Video exceeds the byte limit: ${descriptor.path}`)
  validateMp4(contents, descriptor.path)
  const video = await inspectVideo(absolutePath)
  assert(Number.isInteger(video.width) && video.width > 0, `Video width is invalid: ${descriptor.path}`)
  assert(Number.isInteger(video.height) && video.height > 0, `Video height is invalid: ${descriptor.path}`)
  assert(
    video.width <= MAX_VIDEO_DIMENSION && video.height <= MAX_VIDEO_DIMENSION,
    `Video dimensions exceed the limit: ${descriptor.path}`,
  )
  assert(
    Number.isFinite(video.duration) &&
      video.duration > 0 &&
      video.duration <= MAX_VIDEO_DURATION_SECONDS,
    `Video duration is invalid: ${descriptor.path}`,
  )
  return { ...common, format: 'mp4', ...video }
}

function validateRelatedProjects(service, slug) {
  assert(
    Array.isArray(service.relatedProjectSlugs) && service.relatedProjectSlugs.length > 0,
    `Related projects are required for ${slug}`,
  )
  assert(service.relatedProjectSlugs.length <= 3, `Too many related projects for ${slug}`)
  const unique = new Set(service.relatedProjectSlugs)
  assert(unique.size === service.relatedProjectSlugs.length, `Duplicate related project slug in ${slug}`)
  for (const projectSlug of service.relatedProjectSlugs) {
    assert(PROJECT_SLUG_PATTERN.test(projectSlug), `Invalid related project slug ${projectSlug} in ${slug}`)
  }
}

export async function buildServiceImportPlan(
  manifest,
  { workspaceRoot, inspectVideo = inspectVideoWithFfprobe },
) {
  assert(manifest?.version === 2, 'Unsupported service import manifest version')
  assert(Array.isArray(manifest.services) && manifest.services.length > 0, 'Import manifest services are required')

  const serviceSlugs = new Set()
  const homeOrders = new Set()
  const servicesPageOrders = new Set()
  const absolutePaths = new Set()
  const assets = []
  const services = []

  for (const service of manifest.services) {
    const content = createAdminServiceBodySchema.parse(service.content)
    assert(content.status === 'draft', `Imported service must begin as a draft: ${content.slug}`)
    assert(content.capabilities?.length > 0, `Capabilities are required for ${content.slug}`)
    assert(content.tools?.length > 0, `Tools are required for ${content.slug}`)
    assert(!serviceSlugs.has(content.slug), `Duplicate service slug: ${content.slug}`)
    assert(!homeOrders.has(content.home.order), `Duplicate Home order: ${content.home.order}`)
    assert(
      !servicesPageOrders.has(content.servicesPageOrder),
      `Duplicate Services page order: ${content.servicesPageOrder}`,
    )
    serviceSlugs.add(content.slug)
    homeOrders.add(content.home.order)
    servicesPageOrders.add(content.servicesPageOrder)

    validateRelatedProjects(service, content.slug)
    assert(
      Array.isArray(service.showcase) && service.showcase.length > 0,
      `Showcase is required for ${content.slug}`,
    )

    const showcaseKeys = new Set()
    const showcase = []
    for (const descriptor of service.showcase) {
      assert(ASSET_KEY_PATTERN.test(descriptor.key), `Invalid showcase key in ${content.slug}`)
      assert(!showcaseKeys.has(descriptor.key), `Duplicate showcase key ${descriptor.key} in ${content.slug}`)
      showcaseKeys.add(descriptor.key)

      const assetKey = `${content.slug}.${descriptor.key}`
      const requiresPreview = descriptor.kind === 'video' || descriptor.kind === 'animation'
      assert(
        requiresPreview ? Boolean(descriptor.preview) : !descriptor.preview,
        `${requiresPreview ? 'Preview is required' : 'Preview is not supported'} for ${assetKey}`,
      )

      const asset = await inspectAsset(descriptor, {
        key: assetKey,
        role: 'showcase',
        workspaceRoot,
        absolutePaths,
        inspectVideo,
      })
      assets.push(asset)

      let previewAssetKey = null
      if (descriptor.preview) {
        previewAssetKey = `${assetKey}.preview`
        const preview = await inspectAsset(
          { ...descriptor.preview, kind: 'image' },
          {
            key: previewAssetKey,
            role: 'preview',
            workspaceRoot,
            absolutePaths,
            inspectVideo,
          },
        )
        assets.push(preview)
      }

      showcase.push({ key: descriptor.key, kind: descriptor.kind, assetKey, previewAssetKey })
    }

    services.push({
      content,
      relatedProjectSlugs: [...service.relatedProjectSlugs],
      showcase,
    })
  }

  assert(
    services.filter(({ content }) => content.home.featured).length <= 4,
    'Home cannot contain more than 4 services',
  )
  return { version: manifest.version, assets, services }
}

export function isServiceImportPlanPublishable(plan) {
  return plan.services.every(
    (service) =>
      service.content.capabilities.length > 0 &&
      service.content.tools.length > 0 &&
      service.relatedProjectSlugs.length > 0 &&
      service.showcase.length > 0,
  )
}

function initialImportState(manifestVersion) {
  return {
    version: IMPORT_STATE_VERSION,
    manifestVersion,
    assets: {},
    services: {},
    supersededMediaAssetIds: [],
    supersededProviderAssetIds: [],
    mediaCompletedAt: null,
    completedAt: null,
  }
}

export async function loadServiceImportState(statePath, manifestVersion) {
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8'))
    assert(state.version === IMPORT_STATE_VERSION, 'Unsupported service import state version')
    assert(state.manifestVersion === manifestVersion, 'Service import state manifest version does not match')
    assert(state.assets && typeof state.assets === 'object', 'Service import state assets are missing')
    assert(Array.isArray(state.supersededMediaAssetIds), 'Service import state media history is invalid')
    assert(Array.isArray(state.supersededProviderAssetIds), 'Service import state provider history is invalid')
    if (!state.services) {
      state.services = {}
      state.mediaCompletedAt = state.completedAt ?? null
      state.completedAt = null
    }
    assert(typeof state.services === 'object', 'Service import state service checkpoints are invalid')
    state.mediaCompletedAt ??= null
    return state
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return initialImportState(manifestVersion)
  }
}

export async function saveServiceImportState(statePath, state) {
  await mkdir(dirname(statePath), { recursive: true })
  const temporaryPath = `${statePath}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  await chmod(temporaryPath, 0o600)
  await rename(temporaryPath, statePath)
}

function rememberSupersededAsset(state, entry) {
  if (entry?.mediaAssetId && !state.supersededMediaAssetIds.includes(entry.mediaAssetId)) {
    state.supersededMediaAssetIds.push(entry.mediaAssetId)
  }
  if (entry?.providerAssetId && !state.supersededProviderAssetIds.includes(entry.providerAssetId)) {
    state.supersededProviderAssetIds.push(entry.providerAssetId)
  }
}

function mediaEntry(asset) {
  return {
    sha256: asset.sha256,
    kind: asset.kind,
    path: asset.path,
  }
}

async function ensureServiceMediaAsset({
  api,
  asset,
  previewAssetId,
  state,
  statePath,
  saveState,
}) {
  let entry = state.assets[asset.key]

  if (entry && (entry.sha256 !== asset.sha256 || entry.kind !== asset.kind)) {
    rememberSupersededAsset(state, entry)
    entry = undefined
  }

  entry ??= mediaEntry(asset)
  state.assets[asset.key] = entry

  if (entry.mediaAssetId) {
    const existing = await api.getMediaAsset(entry.mediaAssetId)
    const canReuse = existing?.status === 'active' && existing.kind === asset.kind

    if (canReuse) {
      const update = {}
      if (existing.alt !== asset.alt) update.alt = asset.alt
      if (
        (asset.kind === 'video' || asset.kind === 'animation') &&
        existing.previewAsset !== previewAssetId
      ) {
        update.previewAsset = previewAssetId
      }
      if (Object.keys(update).length > 0) await api.updateMediaAsset(entry.mediaAssetId, update)

      Object.assign(entry, mediaEntry(asset), {
        alt: asset.alt,
        previewAssetId: previewAssetId ?? null,
      })
      await saveState(statePath, state)
      return { mediaAssetId: entry.mediaAssetId, action: 'reused' }
    }

    if (existing) {
      rememberSupersededAsset(state, entry)
      entry = mediaEntry(asset)
      state.assets[asset.key] = entry
    } else {
      delete entry.mediaAssetId
    }
  }

  if (!entry.providerAssetId) {
    const descriptor = await api.createUploadDescriptor(asset.kind)
    const uploaded = await api.uploadToProvider(descriptor, asset)
    Object.assign(entry, {
      provider: uploaded.provider,
      providerAssetId: uploaded.providerAssetId,
      alt: asset.alt,
      previewAssetId: previewAssetId ?? null,
    })
    await saveState(statePath, state)
  }

  const registered = await api.registerMediaAsset({
    provider: entry.provider,
    providerAssetId: entry.providerAssetId,
    kind: asset.kind,
    ...(previewAssetId ? { previewAsset: previewAssetId } : {}),
    alt: asset.alt,
  })
  Object.assign(entry, mediaEntry(asset), {
    mediaAssetId: registered.id,
    alt: asset.alt,
    previewAssetId: previewAssetId ?? null,
  })
  await saveState(statePath, state)
  return { mediaAssetId: entry.mediaAssetId, action: 'registered' }
}

function previewMappings(plan) {
  return new Map(
    plan.services.flatMap((service) =>
      service.showcase
        .filter(({ previewAssetKey }) => previewAssetKey)
        .map(({ assetKey, previewAssetKey }) => [assetKey, previewAssetKey]),
    ),
  )
}

export async function uploadServiceMediaPlan({
  api,
  plan,
  state,
  statePath,
  saveState = saveServiceImportState,
  onProgress = () => {},
  now = () => new Date(),
}) {
  const plannedKeys = new Set(plan.assets.map(({ key }) => key))
  for (const [key, entry] of Object.entries(state.assets)) {
    if (plannedKeys.has(key)) continue
    rememberSupersededAsset(state, entry)
    delete state.assets[key]
  }

  state.mediaCompletedAt = null
  await saveState(statePath, state)

  const previewByAssetKey = previewMappings(plan)
  const orderedAssets = [
    ...plan.assets.filter(({ kind }) => kind === 'image'),
    ...plan.assets.filter(({ kind }) => kind !== 'image'),
  ]
  const mediaAssetIds = {}

  for (const asset of orderedAssets) {
    const previewAssetKey = previewByAssetKey.get(asset.key)
    const previewAssetId = previewAssetKey ? mediaAssetIds[previewAssetKey] : undefined
    assert(!previewAssetKey || previewAssetId, `Preview media asset is missing for ${asset.key}`)

    const result = await ensureServiceMediaAsset({
      api,
      asset,
      previewAssetId,
      state,
      statePath,
      saveState,
    })
    mediaAssetIds[asset.key] = result.mediaAssetId
    onProgress({ asset, action: result.action, mediaAssetId: result.mediaAssetId })
  }

  state.mediaCompletedAt = now().toISOString()
  await saveState(statePath, state)
  return mediaAssetIds
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function sameTools(left, right) {
  return (
    left.length === right.length &&
    left.every(
      (tool, index) => tool.key === right[index].key && tool.label === right[index].label,
    )
  )
}

function serviceMatchesPayload(service, payload) {
  return (
    service.slug === payload.slug &&
    service.title === payload.title &&
    service.description === payload.description &&
    service.icon === payload.icon &&
    service.tone === payload.tone &&
    sameArray(service.capabilities, payload.capabilities) &&
    sameTools(service.tools, payload.tools) &&
    sameArray(service.relatedProjects, payload.relatedProjects) &&
    sameArray(service.showcaseAssets, payload.showcaseAssets) &&
    service.home.featured === payload.home.featured &&
    service.home.order === payload.home.order &&
    service.servicesPageOrder === payload.servicesPageOrder
  )
}

export function createServiceImportContext(plan, existingProjects, existingServices) {
  const projectsBySlug = new Map()
  for (const project of existingProjects) {
    assert(!projectsBySlug.has(project.slug), `Duplicate remote project slug: ${project.slug}`)
    projectsBySlug.set(project.slug, project)
  }

  const servicesBySlug = new Map()
  for (const service of existingServices) {
    assert(!servicesBySlug.has(service.slug), `Duplicate remote service slug: ${service.slug}`)
    servicesBySlug.set(service.slug, service)
  }

  const requiredProjectSlugs = new Set(
    plan.services.flatMap(({ relatedProjectSlugs }) => relatedProjectSlugs),
  )
  for (const slug of requiredProjectSlugs) {
    const project = projectsBySlug.get(slug)
    assert(project, `Required project is missing: ${slug}`)
    assert(project.status === 'published', `Required project is not published: ${slug}`)
    assert(project.logoAsset, `Required project has no logo asset: ${slug}`)
  }

  const plannedSlugs = new Set(plan.services.map(({ content }) => content.slug))
  const outsideFeaturedCount = existingServices.filter(
    (service) =>
      !plannedSlugs.has(service.slug) && service.status === 'published' && service.home.featured,
  ).length
  const plannedFeaturedCount = plan.services.filter(({ content }) => content.home.featured).length
  assert(
    outsideFeaturedCount + plannedFeaturedCount <= 4,
    'Published Home services outside the manifest would exceed the four-service limit',
  )

  return { projectsBySlug, servicesBySlug, requiredProjectSlugs }
}

export async function validateServiceProjectLogos({ api, context }) {
  const checkedAssetIds = new Set()
  for (const slug of context.requiredProjectSlugs) {
    const project = context.projectsBySlug.get(slug)
    if (!project.logoAsset || checkedAssetIds.has(project.logoAsset)) continue
    checkedAssetIds.add(project.logoAsset)
    const logo = await api.getMediaAsset(project.logoAsset)
    assert(
      logo?.status === 'active' && logo.kind === 'image',
      `Required project logo is missing, inactive, or not an image: ${project.slug}`,
    )
  }
}

export function buildServicePayload(service, mediaAssetIds, context) {
  const relatedProjects = service.relatedProjectSlugs.map((slug) => {
    const projectId = context.projectsBySlug.get(slug)?.id
    assert(projectId, `Project ID is missing for service ${service.content.slug}: ${slug}`)
    return projectId
  })
  const showcaseAssets = service.showcase.map(({ assetKey }) => {
    const mediaAssetId = mediaAssetIds[assetKey]
    assert(mediaAssetId, `MediaAsset ID is missing for service ${service.content.slug}: ${assetKey}`)
    return mediaAssetId
  })

  return {
    ...service.content,
    status: 'draft',
    home: { ...service.content.home },
    capabilities: [...service.content.capabilities],
    tools: service.content.tools.map((tool) => ({ ...tool })),
    relatedProjects,
    showcaseAssets,
  }
}

export async function applyServiceDrafts({
  api,
  plan,
  mediaAssetIds,
  context,
  state,
  statePath,
  saveState = saveServiceImportState,
  onProgress = () => {},
}) {
  state.services ??= {}
  state.completedAt = null
  await saveState(statePath, state)
  const preparedServices = []

  for (const service of plan.services) {
    const slug = service.content.slug
    const existing = context.servicesBySlug.get(slug) ?? null
    const payload = buildServicePayload(service, mediaAssetIds, context)
    let prepared
    let action

    if (
      existing &&
      ['draft', 'published'].includes(existing.status) &&
      serviceMatchesPayload(existing, payload)
    ) {
      prepared = existing
      action = 'reused'
    } else if (existing) {
      prepared = await api.updateService(existing.id, payload)
      action = 'updated'
    } else {
      prepared = await api.createService(payload)
      action = 'created'
    }

    state.services[slug] = { serviceId: prepared.id, status: prepared.status }
    await saveState(statePath, state)
    preparedServices.push(prepared)
    onProgress({ service: prepared, action })
  }

  return preparedServices
}

export async function publishServiceDrafts({
  api,
  services,
  state,
  statePath,
  saveState = saveServiceImportState,
  onProgress = () => {},
}) {
  const publishedServices = []

  for (const service of services) {
    const published =
      service.status === 'published'
        ? service
        : await api.updateService(service.id, { status: 'published' })
    state.services[published.slug] = { serviceId: published.id, status: published.status }
    await saveState(statePath, state)
    publishedServices.push(published)
    onProgress({ service: published, action: service.status === 'published' ? 'reused' : 'published' })
  }

  return publishedServices
}

function assertOrderedSubset(actual, expected, label) {
  let previousIndex = -1
  for (const value of expected) {
    const index = actual.indexOf(value)
    assert(index !== -1, `${label} is missing ${value}`)
    assert(index > previousIndex, `${label} order does not match the manifest`)
    previousIndex = index
  }
}

export async function verifyPublicServiceImport({ api, plan, mediaAssetIds }) {
  const list = await api.listPublicServices()
  const home = await api.listPublicServices('home')
  const assetsByKey = new Map(plan.assets.map((asset) => [asset.key, asset]))
  const expectedListSlugs = [...plan.services]
    .sort((left, right) => left.content.servicesPageOrder - right.content.servicesPageOrder)
    .map(({ content }) => content.slug)
  const expectedHomeSlugs = plan.services
    .filter(({ content }) => content.home.featured)
    .sort((left, right) => left.content.home.order - right.content.home.order)
    .map(({ content }) => content.slug)

  assertOrderedSubset(
    list.map(({ slug }) => slug),
    expectedListSlugs,
    'Public Services list',
  )
  assertOrderedSubset(
    home.map(({ slug }) => slug),
    expectedHomeSlugs,
    'Public Home services list',
  )

  for (const service of plan.services) {
    const detail = await api.getPublicService(service.content.slug)
    for (const field of ['slug', 'title', 'description', 'icon', 'tone']) {
      assert(
        detail[field] === service.content[field],
        `Public ${field} does not match for ${service.content.slug}`,
      )
    }
    assert(
      sameArray(detail.capabilities, service.content.capabilities),
      `Public capabilities do not match for ${service.content.slug}`,
    )
    assert(
      sameTools(detail.tools, service.content.tools),
      `Public tools do not match for ${service.content.slug}`,
    )
    assert(
      sameArray(
        detail.relatedProjects.map(({ slug }) => slug),
        service.relatedProjectSlugs,
      ),
      `Public related projects do not match for ${service.content.slug}`,
    )
    assert(
      sameArray(
        detail.showcaseAssets.map(({ id }) => id),
        service.showcase.map(({ assetKey }) => mediaAssetIds[assetKey]),
      ),
      `Public showcase does not match for ${service.content.slug}`,
    )

    for (const [index, item] of service.showcase.entries()) {
      const publicAsset = detail.showcaseAssets[index]
      const plannedAsset = assetsByKey.get(item.assetKey)
      assert(publicAsset.kind === item.kind, `Public media kind does not match for ${item.assetKey}`)
      assert(
        publicAsset.format === plannedAsset.format,
        `Public media format does not match for ${item.assetKey}`,
      )
      assert(publicAsset.alt === plannedAsset.alt, `Public media alt does not match for ${item.assetKey}`)
      assert(
        publicAsset.width === (plannedAsset.width ?? null) &&
          publicAsset.height === (plannedAsset.height ?? null),
        `Public media dimensions do not match for ${item.assetKey}`,
      )
      assert(publicAsset.url, `Public media URL is missing for ${item.assetKey}`)
      if (item.kind === 'video') {
        assert(publicAsset.duration > 0, `Public media duration is missing for ${item.assetKey}`)
      }
      if (item.previewAssetKey) {
        const plannedPreview = assetsByKey.get(item.previewAssetKey)
        assert(publicAsset.preview?.url, `Public media preview is missing for ${item.assetKey}`)
        assert(
          publicAsset.preview.id === mediaAssetIds[item.previewAssetKey] &&
            publicAsset.preview.alt === plannedPreview.alt &&
            publicAsset.preview.width === plannedPreview.width &&
            publicAsset.preview.height === plannedPreview.height,
          `Public media preview does not match for ${item.assetKey}`,
        )
      }
    }
  }

  return { serviceCount: plan.services.length }
}
