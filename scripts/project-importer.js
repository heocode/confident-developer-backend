import { createHash } from 'node:crypto'
import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

import { MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION } from '../src/modules/media/media-asset.js'
import {
  createAdminProjectBodySchema,
  updateAdminProjectBodySchema,
} from '../src/modules/projects/admin/admin-project-schemas.js'

const PNG_SIGNATURE = '89504e470d0a1a0a'
const IMPORT_STATE_VERSION = 1

export {
  ImportApiError,
  createImportApiClient,
  parseImportArguments,
} from './utils/import-api-client.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readPngDimensions(buffer, path) {
  assert(buffer.length >= 24, `Asset is not a valid PNG: ${path}`)
  assert(buffer.subarray(0, 8).toString('hex') === PNG_SIGNATURE, `Asset must be a PNG: ${path}`)
  assert(buffer.subarray(12, 16).toString('ascii') === 'IHDR', `Asset is missing a PNG header: ${path}`)

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

function referencedAssetKeys(project) {
  return [
    project.media.logo,
    project.media.homePreview,
    ...project.media.screenshots.map(({ asset }) => asset),
  ]
}

export async function buildImportPlan(manifest, { workspaceRoot }) {
  assert(manifest?.version === 1, 'Unsupported project import manifest version')
  assert(manifest.assets && typeof manifest.assets === 'object', 'Import manifest assets are required')
  assert(Array.isArray(manifest.projects) && manifest.projects.length > 0, 'Import manifest projects are required')

  const assets = []
  const absolutePaths = new Set()

  for (const [key, asset] of Object.entries(manifest.assets)) {
    assert(typeof asset.path === 'string' && asset.path.length > 0, `Asset path is required for ${key}`)
    assert(typeof asset.alt === 'string' && asset.alt.trim().length > 0, `Asset alt text is required for ${key}`)
    assert(asset.alt.length <= 300, `Asset alt text is too long for ${key}`)

    const absolutePath = resolve(workspaceRoot, asset.path)
    assert(!absolutePaths.has(absolutePath), `Multiple asset keys reference the same file: ${asset.path}`)
    absolutePaths.add(absolutePath)

    const metadata = await stat(absolutePath)
    assert(metadata.isFile(), `Asset is not a file: ${asset.path}`)
    assert(metadata.size > 0 && metadata.size <= MAX_IMAGE_BYTES, `Asset exceeds the byte limit: ${asset.path}`)

    const contents = await readFile(absolutePath)
    const { width, height } = readPngDimensions(contents, asset.path)
    assert(width > 0 && width <= MAX_IMAGE_DIMENSION, `Asset width is invalid: ${asset.path}`)
    assert(height > 0 && height <= MAX_IMAGE_DIMENSION, `Asset height is invalid: ${asset.path}`)

    assets.push({
      key,
      path: asset.path,
      absolutePath,
      filename: basename(asset.path),
      alt: asset.alt.trim(),
      bytes: metadata.size,
      width,
      height,
      sha256: createHash('sha256').update(contents).digest('hex'),
    })
  }

  const assetKeys = new Set(assets.map(({ key }) => key))
  const projectSlugs = new Set()
  const projects = manifest.projects.map((project) => {
    const content = createAdminProjectBodySchema.parse(project.content)
    assert(content.status === 'draft', `Imported project must begin as a draft: ${content.slug}`)
    assert(!projectSlugs.has(content.slug), `Duplicate project slug: ${content.slug}`)
    projectSlugs.add(content.slug)

    assert(project.media && typeof project.media === 'object', `Media mapping is required for ${content.slug}`)
    assert(Array.isArray(project.media.screenshots) && project.media.screenshots.length > 0, `Screenshots are required for ${content.slug}`)

    for (const key of referencedAssetKeys(project)) {
      assert(assetKeys.has(key), `Unknown asset key ${key} in project ${content.slug}`)
    }

    for (const screenshot of project.media.screenshots) {
      assert(
        typeof screenshot.alt === 'string' && screenshot.alt.trim().length > 0 && screenshot.alt.length <= 300,
        `Screenshot alt text is invalid for ${content.slug}`,
      )
    }

    return {
      content,
      media: structuredClone(project.media),
    }
  })

  return { version: manifest.version, assets, projects }
}

function retainIds(existingItems, incomingItems, keyOf) {
  if (!existingItems) return incomingItems ?? []

  const existingByKey = new Map(existingItems.map((item) => [keyOf(item), item]))
  return (incomingItems ?? []).map((item) => {
    const existing = existingByKey.get(keyOf(item))
    return existing?.id ? { id: existing.id, ...item } : item
  })
}

export function buildProjectPayload(project, mediaAssetIds, existingProject = null) {
  const mediaId = (key) => {
    const id = mediaAssetIds[key]
    assert(id, `Media asset ID is missing for ${key}`)
    return id
  }
  const screenshots = project.media.screenshots.map((screenshot) => ({
    asset: mediaId(screenshot.asset),
    alt: screenshot.alt,
  }))
  const payload = {
    ...structuredClone(project.content),
    status: 'draft',
    buildBreakdown: retainIds(
      existingProject?.buildBreakdown,
      project.content.buildBreakdown,
      (item) => item.label,
    ),
    links: retainIds(existingProject?.links, project.content.links, (item) => item.label),
    logoAsset: mediaId(project.media.logo),
    homePreviewAsset: mediaId(project.media.homePreview),
    screenshots: retainIds(existingProject?.screenshots, screenshots, (item) => item.asset),
  }

  // The manifest validation has already transformed ISO timeline strings into
  // Date instances. Serialize once to the actual HTTP representation before
  // running the API-boundary schema again.
  const transportPayload = JSON.parse(JSON.stringify(payload))

  return existingProject
    ? updateAdminProjectBodySchema.parse(transportPayload)
    : createAdminProjectBodySchema.parse(transportPayload)
}

export async function loadImportState(statePath) {
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8'))
    assert(state.version === IMPORT_STATE_VERSION, 'Unsupported project import state version')
    assert(state.assets && state.projects, 'Project import state is incomplete')
    return state
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return {
      version: IMPORT_STATE_VERSION,
      assets: {},
      projects: {},
      orphanedMediaAssetIds: [],
      completedAt: null,
    }
  }
}

export async function saveImportState(statePath, state) {
  await mkdir(dirname(statePath), { recursive: true })
  const temporaryPath = `${statePath}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  await chmod(temporaryPath, 0o600)
  await rename(temporaryPath, statePath)
}
