import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

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

function mediaMimeType(asset) {
  const format = asset.format ?? extname(asset.filename).slice(1).toLowerCase()
  const mimeTypes = {
    png: 'image/png',
    webp: 'image/webp',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    avif: 'image/avif',
    mp4: 'video/mp4',
    riv: 'application/octet-stream',
  }
  const mimeType = mimeTypes[format]
  assert(mimeType, `Unsupported import media format: ${format}`)
  return mimeType
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

  function resourceClient(resource) {
    return {
      async list() {
        const { body } = await request(`/admin/${resource}`)
        return body.data
      },
      async create(payload) {
        const { body } = await request(`/admin/${resource}`, { method: 'POST', body: payload })
        return body.data
      },
      async update(resourceId, payload) {
        const { body } = await request(`/admin/${resource}/${resourceId}`, {
          method: 'PATCH',
          body: payload,
        })
        return body.data
      },
    }
  }

  const projects = resourceClient('projects')
  const services = resourceClient('services')

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

    listProjects: projects.list,
    createProject: projects.create,
    updateProject: projects.update,
    listServices: services.list,
    createService: services.create,
    updateService: services.update,

    async getMediaAsset(mediaAssetId) {
      const result = await request(`/admin/media/${mediaAssetId}`, { allowNotFound: true })
      return result?.body.data ?? null
    },

    async createUploadDescriptor(kind = 'image') {
      const { body } = await request('/admin/media/upload-signature', {
        method: 'POST',
        body: { kind },
      })
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
      form.append('file', new Blob([contents], { type: mediaMimeType(asset) }), asset.filename)

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
