import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import mongoose from 'mongoose'

import { createApp } from '../../../src/app.js'
import { loadEnvironment } from '../../../src/config/environment.js'
import { createMediaService } from '../../../src/modules/media/media-service.js'
import { createCloudinaryMediaProvider } from '../../../src/modules/media/providers/cloudinary-media-provider.js'

const frontendOrigin = 'http://localhost:5173'
const sessionCookie = 'cd_admin_session=media-session-token'
const mediaAssetId = '68e6b0000000000000000001'
const providerAssetId = '6f87f9462fbb4f5a9d6b892b4d0b2f31'

function mediaData(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(mediaAssetId),
    provider: 'cloudinary',
    providerAssetId,
    secureUrl: 'https://res.cloudinary.com/example/image/upload/portfolio/images/example.webp',
    resourceType: 'image',
    format: 'webp',
    width: 1600,
    height: 900,
    bytes: 245_000,
    alt: 'Unicon dashboard',
    status: 'active',
    createdAt: new Date('2026-10-07T12:00:00.000Z'),
    updatedAt: new Date('2026-10-07T12:00:00.000Z'),
    ...overrides,
  }
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const body = await response.json()
  return { response, body }
}

describe('admin media HTTP contract', () => {
  let baseUrl
  let server
  let calls

  const authService = {
    async getAdminForToken(token) {
      if (token !== 'media-session-token') {
        const error = new Error('Authentication required')
        error.status = 401
        throw error
      }

      return { id: 'admin-id', displayName: 'Owner', email: 'owner@example.com' }
    },
  }

  const mediaService = {
    createUploadDescriptor() {
      calls.signature += 1
      return {
        provider: 'cloudinary',
        upload: {
          method: 'POST',
          url: 'https://api.cloudinary.com/v1_1/example/image/upload',
          fields: { api_key: 'public-key', signature: 'signed-value', timestamp: 1_791_379_200 },
        },
        constraints: { formats: ['webp'], maxBytes: 10_485_760, maxWidth: 10_000, maxHeight: 10_000 },
        expiresAt: new Date('2026-10-07T13:00:00.000Z'),
      }
    },
    async registerAsset(input) {
      calls.register.push(input)
      return { asset: mediaData({ alt: input.alt }), created: true }
    },
    async listAssets(input) {
      calls.list.push(input)
      return {
        items: [mediaData()],
        pagination: { page: input.page, limit: input.limit, totalItems: 1, totalPages: 1 },
      }
    },
    async getAsset(id) {
      calls.get.push(id)
      return { asset: mediaData(), usage: { inUse: true, projectCount: 2 } }
    },
    async updateAsset(id, input) {
      calls.update.push({ id, input })
      return mediaData({ alt: input.alt })
    },
    async deleteAsset(id) {
      calls.delete.push(id)
    },
  }

  before(async () => {
    calls = { signature: 0, register: [], list: [], get: [], update: [], delete: [] }
    const environment = loadEnvironment({ NODE_ENV: 'test', CLIENT_ORIGINS: frontendOrigin })
    const app = createApp({ environment, authService, mediaService })

    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1')
      server.once('listening', resolve)
      server.once('error', reject)
    })

    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('protects media reads and requires a trusted origin for writes', async () => {
    const unauthenticated = await requestJson(baseUrl, '/api/v1/admin/media')
    assert.equal(unauthenticated.response.status, 401)

    const missingOrigin = await requestJson(baseUrl, '/api/v1/admin/media/upload-signature', {
      method: 'POST',
      headers: { cookie: sessionCookie },
    })
    assert.equal(missingOrigin.response.status, 403)
  })

  it('returns a signed direct-upload descriptor without exposing secrets', async () => {
    const { response, body } = await requestJson(baseUrl, '/api/v1/admin/media/upload-signature', {
      method: 'POST',
      headers: { cookie: sessionCookie, origin: frontendOrigin },
    })

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(body.data.provider, 'cloudinary')
    assert.equal(body.data.upload.fields.api_key, 'public-key')
    assert.equal(JSON.stringify(body).includes('private-secret'), false)
    assert.equal(calls.signature, 1)
  })

  it('registers an uploaded asset through an explicit admin serializer', async () => {
    const { response, body } = await requestJson(baseUrl, '/api/v1/admin/media', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        origin: frontendOrigin,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'cloudinary',
        providerAssetId,
        alt: 'Unicon dashboard',
      }),
    })

    assert.equal(response.status, 201)
    assert.equal(body.data.id, mediaAssetId)
    assert.equal(body.data.url.startsWith('https://'), true)
    assert.equal('providerAssetId' in body.data, false)
    assert.equal('_id' in body.data, false)
    assert.equal('__v' in body.data, false)
  })

  it('returns paginated media and usage details', async () => {
    const list = await requestJson(baseUrl, '/api/v1/admin/media?page=2&limit=12&status=active', {
      headers: { cookie: sessionCookie },
    })
    assert.equal(list.response.status, 200)
    assert.equal(list.body.data.items.length, 1)
    assert.deepEqual(list.body.data.pagination, { page: 2, limit: 12, totalItems: 1, totalPages: 1 })
    assert.deepEqual(calls.list.at(-1), { page: 2, limit: 12, status: 'active' })

    const detail = await requestJson(baseUrl, `/api/v1/admin/media/${mediaAssetId}`, {
      headers: { cookie: sessionCookie },
    })
    assert.equal(detail.response.status, 200)
    assert.deepEqual(detail.body.data.usage, { inUse: true, projectCount: 2 })
  })

  it('updates alt text and deletes through the protected API', async () => {
    const update = await requestJson(baseUrl, `/api/v1/admin/media/${mediaAssetId}`, {
      method: 'PATCH',
      headers: {
        cookie: sessionCookie,
        origin: frontendOrigin,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ alt: 'Updated accessible description' }),
    })
    assert.equal(update.response.status, 200)
    assert.equal(update.body.data.alt, 'Updated accessible description')

    const deletion = await requestJson(baseUrl, `/api/v1/admin/media/${mediaAssetId}`, {
      method: 'DELETE',
      headers: { cookie: sessionCookie, origin: frontendOrigin },
    })
    assert.equal(deletion.response.status, 200)
    assert.deepEqual(deletion.body, { success: true, message: 'Media asset deleted successfully.' })
  })

  it('rejects invalid pagination, malformed IDs, unknown fields, and empty alt text', async () => {
    const invalidList = await requestJson(baseUrl, '/api/v1/admin/media?page=0&limit=101', {
      headers: { cookie: sessionCookie },
    })
    assert.equal(invalidList.response.status, 400)

    const malformedId = await requestJson(baseUrl, '/api/v1/admin/media/not-an-id', {
      headers: { cookie: sessionCookie },
    })
    assert.equal(malformedId.response.status, 400)

    const invalidRegistration = await requestJson(baseUrl, '/api/v1/admin/media', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        origin: frontendOrigin,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'cloudinary',
        providerAssetId,
        alt: '',
        apiSecret: 'must-not-be-accepted',
      }),
    })
    assert.equal(invalidRegistration.response.status, 400)
  })
})

function createFakeCloudinaryClient(resourceOverrides = {}) {
  const state = { configurations: [], signatures: [], resourceIds: [], deletions: [] }
  const client = {
    config(configuration) {
      state.configurations.push(configuration)
    },
    utils: {
      api_sign_request(parameters, secret) {
        state.signatures.push({ parameters, secret })
        return 'sha256-signature'
      },
    },
    api: {
      async resource_by_asset_id(assetId, options) {
        state.resourceIds.push({ assetId, options })
        return {
          asset_id: assetId,
          public_id: 'portfolio/images/generated-id',
          resource_type: 'image',
          type: 'upload',
          secure_url: 'https://res.cloudinary.com/example/image/upload/generated.webp',
          format: 'webp',
          width: 1600,
          height: 900,
          bytes: 245_000,
          tags: ['confident-developer-managed'],
          ...resourceOverrides,
        }
      },
      async delete_resources_by_asset_ids(assetIds, options) {
        state.deletions.push({ assetIds, options })
        return { deleted: { returned_resource_key: 'deleted' } }
      },
    },
  }

  return { client, state }
}

describe('Cloudinary media provider', () => {
  const configuration = {
    cloudName: 'portfolio-cloud',
    apiKey: 'public-key',
    apiSecret: 'private-secret',
  }

  it('creates a constrained signed upload descriptor without exposing the API secret', () => {
    const { client, state } = createFakeCloudinaryClient()
    const provider = createCloudinaryMediaProvider(configuration, {
      client,
      now: () => new Date('2026-10-07T12:00:00.000Z'),
      createId: () => 'generated-id',
    })

    const descriptor = provider.createUploadDescriptor()

    assert.equal(descriptor.upload.method, 'POST')
    assert.equal(descriptor.upload.fields.public_id, 'portfolio/images/generated-id')
    assert.equal(descriptor.upload.fields.overwrite, 'false')
    assert.equal(descriptor.upload.fields.signature, 'sha256-signature')
    assert.equal(descriptor.expiresAt.toISOString(), '2026-10-07T13:00:00.000Z')
    assert.equal(JSON.stringify(descriptor).includes('private-secret'), false)
    assert.deepEqual(state.signatures[0].parameters.allowed_formats, ['jpg', 'jpeg', 'png', 'webp', 'avif'])
    assert.equal(state.signatures[0].secret, 'private-secret')
    assert.equal(state.configurations[0].signature_algorithm, 'sha256')
  })

  it('creates optimized delivery URLs from fixed public presets', () => {
    const { client } = createFakeCloudinaryClient()
    const provider = createCloudinaryMediaProvider(configuration, { client })

    assert.equal(
      provider.createDeliveryUrl({
        secureUrl: 'https://res.cloudinary.com/example/image/upload/v123/generated.webp',
        preset: 'logo',
      }),
      'https://res.cloudinary.com/example/image/upload/c_limit,w_512,h_512,f_auto,q_auto/v123/generated.webp',
    )
    assert.throws(
      () => provider.createDeliveryUrl({ secureUrl: 'https://example.com/image.webp', preset: 'logo' }),
      (error) => error.status === 500,
    )
  })

  it('loads authoritative metadata by immutable asset ID', async () => {
    const { client, state } = createFakeCloudinaryClient()
    const provider = createCloudinaryMediaProvider(configuration, { client })

    const metadata = await provider.getAssetMetadata(providerAssetId)

    assert.deepEqual(metadata, {
      provider: 'cloudinary',
      providerAssetId,
      secureUrl: 'https://res.cloudinary.com/example/image/upload/generated.webp',
      resourceType: 'image',
      format: 'webp',
      width: 1600,
      height: 900,
      bytes: 245_000,
    })
    assert.deepEqual(state.resourceIds, [{ assetId: providerAssetId, options: { tags: true } }])
  })

  it('rejects assets outside the managed upload flow', async () => {
    const { client } = createFakeCloudinaryClient({ public_id: 'unmanaged/image' })
    const provider = createCloudinaryMediaProvider(configuration, { client })

    await assert.rejects(provider.getAssetMetadata(providerAssetId), (error) => {
      assert.equal(error.status, 400)
      assert.equal(error.message, 'Uploaded media asset was not created by this application')
      return true
    })
  })

  it('deletes by immutable asset ID and invalidates CDN copies', async () => {
    const { client, state } = createFakeCloudinaryClient()
    const provider = createCloudinaryMediaProvider(configuration, { client })

    await provider.deleteAsset(providerAssetId)

    assert.deepEqual(state.deletions, [
      { assetIds: [providerAssetId], options: { invalidate: true } },
    ])
  })

  it('fails safely when credentials are not configured', async () => {
    const { client } = createFakeCloudinaryClient()
    const provider = createCloudinaryMediaProvider(null, { client })

    assert.throws(() => provider.createUploadDescriptor(), (error) => error.status === 503)
    await assert.rejects(provider.getAssetMetadata(providerAssetId), (error) => error.status === 503)
  })
})

function createQueryResult(value) {
  return {
    sort() {
      return this
    },
    skip() {
      return this
    },
    limit() {
      return Promise.resolve(value)
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject)
    },
  }
}

function createMediaServiceHarness({ asset = null, projectCount = 0, assets = [], totalItems = 0 } = {}) {
  const state = {
    created: [],
    deletedMetadata: [],
    providerLookups: [],
    providerDeletions: [],
    saves: 0,
  }

  if (asset) {
    asset.save = async () => {
      state.saves += 1
      return asset
    }
  }

  const mediaModel = {
    async findOne() {
      return asset
    },
    async create(input) {
      state.created.push(input)
      return mediaData(input)
    },
    find() {
      return createQueryResult(assets)
    },
    async countDocuments() {
      return totalItems
    },
    async findById() {
      return asset
    },
    async deleteOne(filter) {
      state.deletedMetadata.push(filter)
    },
  }
  const projectModel = {
    async countDocuments() {
      return projectCount
    },
  }
  const mediaProvider = {
    name: 'cloudinary',
    createDeliveryUrl({ secureUrl, preset }) {
      return `${secureUrl}?preset=${preset}`
    },
    createUploadDescriptor() {
      return { provider: 'cloudinary' }
    },
    async getAssetMetadata(id) {
      state.providerLookups.push(id)
      return {
        provider: 'cloudinary',
        providerAssetId: id,
        secureUrl: 'https://example.com/image.webp',
        resourceType: 'image',
        format: 'webp',
        width: 100,
        height: 100,
        bytes: 1_000,
      }
    },
    async deleteAsset(id) {
      state.providerDeletions.push(id)
    },
  }

  return {
    service: createMediaService({ mediaModel, projectModel, mediaProvider }),
    mediaProvider,
    state,
  }
}

describe('media service', () => {
  it('delegates public delivery URLs through the configured provider', () => {
    const { service } = createMediaServiceHarness()

    assert.equal(
      service.createDeliveryUrl(mediaData(), 'homePreview'),
      'https://res.cloudinary.com/example/image/upload/portfolio/images/example.webp?preset=homePreview',
    )
  })

  it('registers authoritative provider metadata and treats retries as idempotent', async () => {
    const fresh = createMediaServiceHarness()
    const first = await fresh.service.registerAsset({
      provider: 'cloudinary',
      providerAssetId,
      alt: 'Accessible description',
    })

    assert.equal(first.created, true)
    assert.deepEqual(fresh.state.providerLookups, [providerAssetId])
    assert.equal(fresh.state.created[0].alt, 'Accessible description')

    const existing = mediaData()
    const retry = createMediaServiceHarness({ asset: existing })
    const second = await retry.service.registerAsset({
      provider: 'cloudinary',
      providerAssetId,
      alt: 'Ignored retry text',
    })

    assert.equal(second.created, false)
    assert.equal(second.asset, existing)
    assert.deepEqual(retry.state.providerLookups, [])
  })

  it('returns deterministic page metadata and zero total pages for an empty library', async () => {
    const asset = mediaData()
    const populated = createMediaServiceHarness({ assets: [asset], totalItems: 25 })
    const page = await populated.service.listAssets({ page: 2, limit: 24, status: 'active' })
    assert.deepEqual(page.pagination, { page: 2, limit: 24, totalItems: 25, totalPages: 2 })

    const empty = createMediaServiceHarness()
    const emptyPage = await empty.service.listAssets({ page: 1, limit: 24 })
    assert.equal(emptyPage.pagination.totalPages, 0)
  })

  it('reports project usage and blocks deletion while an asset is referenced', async () => {
    const asset = mediaData()
    const { service, state } = createMediaServiceHarness({ asset, projectCount: 2 })

    const result = await service.getAsset(mediaAssetId)
    assert.deepEqual(result.usage, { inUse: true, projectCount: 2 })

    await assert.rejects(service.deleteAsset(mediaAssetId), (error) => error.status === 409)
    assert.deepEqual(state.providerDeletions, [])
    assert.equal(asset.status, 'active')
  })

  it('marks an unused asset pending before provider deletion and removes its metadata last', async () => {
    const asset = mediaData()
    const { service, state } = createMediaServiceHarness({ asset })

    await service.deleteAsset(mediaAssetId)

    assert.equal(asset.status, 'pendingDeletion')
    assert.equal(state.saves, 1)
    assert.deepEqual(state.providerDeletions, [providerAssetId])
    assert.deepEqual(state.deletedMetadata, [{ _id: asset._id }])
  })

  it('retains pendingDeletion metadata when the provider deletion fails', async () => {
    const asset = mediaData()
    const harness = createMediaServiceHarness({ asset })
    harness.mediaProvider.deleteAsset = async () => {
      throw new Error('provider unavailable')
    }

    await assert.rejects(harness.service.deleteAsset(mediaAssetId), /provider unavailable/)
    assert.equal(asset.status, 'pendingDeletion')
    assert.deepEqual(harness.state.deletedMetadata, [])
  })

  it('updates accessible alt text without contacting the provider', async () => {
    const asset = mediaData()
    const { service, state } = createMediaServiceHarness({ asset })

    const updated = await service.updateAsset(mediaAssetId, { alt: 'Updated alt text' })

    assert.equal(updated.alt, 'Updated alt text')
    assert.equal(state.saves, 1)
    assert.deepEqual(state.providerLookups, [])
  })
})
