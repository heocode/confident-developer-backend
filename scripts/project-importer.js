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

export class ImportApiError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'ImportApiError'
    this.status = status
  }
}

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

function readOptionValue(arguments_, index, name) {
  const argument = arguments_[index]
  const prefix = `${name}=`
  if (argument.startsWith(prefix)) return { value: argument.slice(prefix.length), consumed: 0 }

  const value = arguments_[index + 1]
  assert(value && !value.startsWith('--'), `${name} requires a value`)
  return { value, consumed: 1 }
}

function normalizeHttpOrigin(value, name) {
  const url = new URL(value)
  const isLocalHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
  assert(url.protocol === 'https:' || isLocalHttp, `${name} must use HTTPS or local HTTP`)
  assert(url.username === '' && url.password === '', `${name} must not contain credentials`)
  assert(url.pathname === '/' && url.search === '' && url.hash === '', `${name} must be an origin without a path`)
  return url.origin
}

export function parseImportArguments(arguments_) {
  const options = {
    dryRun: false,
    baseUrl: 'http://localhost:3000',
    origin: 'http://localhost:5173',
  }

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (argument === '--base-url' || argument.startsWith('--base-url=')) {
      const { value, consumed } = readOptionValue(arguments_, index, '--base-url')
      options.baseUrl = value
      index += consumed
      continue
    }

    if (argument === '--origin' || argument.startsWith('--origin=')) {
      const { value, consumed } = readOptionValue(arguments_, index, '--origin')
      options.origin = value
      index += consumed
      continue
    }

    throw new Error(`Unknown argument: ${argument}`)
  }

  return {
    ...options,
    baseUrl: normalizeHttpOrigin(options.baseUrl, 'API base URL'),
    origin: normalizeHttpOrigin(options.origin, 'Trusted origin'),
  }
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

async function parseJsonResponse(response) {
  try {
    return await response.json()
  } catch {
    throw new ImportApiError(response.status, 'API returned an invalid JSON response')
  }
}

export function createImportApiClient({ baseUrl, origin, fetchImplementation = fetch }) {
  let sessionCookie

  async function request(path, { method = 'GET', body, authenticated = true, allowNotFound = false } = {}) {
    const headers = { accept: 'application/json' }
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.origin = origin
    if (authenticated) {
      assert(sessionCookie, 'Admin session is not available')
      headers.cookie = sessionCookie
    }

    const response = await fetchImplementation(`${baseUrl}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const responseBody = await parseJsonResponse(response)

    if (allowNotFound && response.status === 404) return null
    if (!response.ok) {
      throw new ImportApiError(response.status, responseBody?.message ?? `API request failed with ${response.status}`)
    }

    return { body: responseBody, response }
  }

  return {
    async login(credentials) {
      const { response, body } = await request('/auth/login', {
        method: 'POST',
        body: credentials,
        authenticated: false,
      })
      const setCookie = response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie')
      assert(setCookie, 'Login response did not include a session cookie')
      sessionCookie = setCookie.split(';', 1)[0]
      return body.data
    },

    async logout() {
      if (!sessionCookie) return
      try {
        await request('/auth/logout', { method: 'POST' })
      } finally {
        sessionCookie = undefined
      }
    },

    async listProjects() {
      const { body } = await request('/admin/projects')
      return body.data
    },

    async createProject(payload) {
      const { body } = await request('/admin/projects', { method: 'POST', body: payload })
      return body.data
    },

    async updateProject(projectId, payload) {
      const { body } = await request(`/admin/projects/${projectId}`, { method: 'PATCH', body: payload })
      return body.data
    },

    async getMediaAsset(mediaAssetId) {
      const result = await request(`/admin/media/${mediaAssetId}`, { allowNotFound: true })
      return result?.body.data ?? null
    },

    async createUploadDescriptor() {
      const { body } = await request('/admin/media/upload-signature', { method: 'POST' })
      return body.data
    },

    async registerMediaAsset(payload) {
      const { body } = await request('/admin/media', { method: 'POST', body: payload })
      return body.data
    },

    async updateMediaAsset(mediaAssetId, payload) {
      const { body } = await request(`/admin/media/${mediaAssetId}`, { method: 'PATCH', body: payload })
      return body.data
    },

    async uploadToProvider(descriptor, asset) {
      const form = new FormData()
      for (const [field, value] of Object.entries(descriptor.upload.fields)) {
        form.append(field, String(value))
      }
      const contents = await readFile(asset.absolutePath)
      form.append('file', new Blob([contents], { type: 'image/png' }), asset.filename)

      const response = await fetchImplementation(descriptor.upload.url, {
        method: descriptor.upload.method,
        body: form,
      })
      const responseBody = await parseJsonResponse(response)
      if (!response.ok || !responseBody.asset_id) {
        throw new ImportApiError(response.status, responseBody?.error?.message ?? 'Media provider upload failed')
      }

      return { provider: descriptor.provider, providerAssetId: responseBody.asset_id }
    },
  }
}
