import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import { serviceImportManifest } from '../../scripts/service-import-manifest.js'
import {
  applyServiceDrafts,
  buildServicePayload,
  buildServiceImportPlan,
  createServiceImportContext,
  isServiceImportPlanPublishable,
  loadServiceImportState,
  publishServiceDrafts,
  saveServiceImportState,
  uploadServiceMediaPlan,
  validateServiceProjectLogos,
  verifyPublicServiceImport,
} from '../../scripts/service-importer.js'
import { createImportApiClient } from '../../scripts/utils/import-api-client.js'

const temporaryDirectories = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

function pngHeader(width, height) {
  const buffer = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a', 'hex').copy(buffer)
  buffer.write('IHDR', 12, 'ascii')
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}

function webpHeader(width, height) {
  const buffer = Buffer.alloc(30)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(buffer.length - 8, 4)
  buffer.write('WEBP', 8, 'ascii')
  buffer.write('VP8X', 12, 'ascii')
  buffer.writeUInt32LE(10, 16)
  buffer.writeUIntLE(width - 1, 24, 3)
  buffer.writeUIntLE(height - 1, 27, 3)
  return buffer
}

function mp4Header() {
  const buffer = Buffer.alloc(12)
  buffer.writeUInt32BE(12, 0)
  buffer.write('ftyp', 4, 'ascii')
  buffer.write('isom', 8, 'ascii')
  return buffer
}

function minimalManifest() {
  const assetRoot = 'makets/service-assets/example'
  return {
    version: 2,
    services: [
      {
        content: {
          slug: 'example',
          title: 'Example',
          description: 'A complete example service.',
          icon: 'mobile-development',
          tone: 'mobile',
          capabilities: ['Mobile Apps'],
          tools: [{ key: 'expo', label: 'Expo' }],
          status: 'draft',
          home: { featured: true, order: 1 },
          servicesPageOrder: 1,
        },
        relatedProjectSlugs: ['unicon'],
        showcase: [
          {
            key: 'screen',
            kind: 'image',
            path: `${assetRoot}/screen.png`,
            alt: 'Example application screen',
          },
          {
            key: 'demo',
            kind: 'video',
            path: `${assetRoot}/demo.mp4`,
            alt: 'Example interaction demo',
            preview: {
              path: `${assetRoot}/demo-preview.webp`,
              alt: 'Preview of the example interaction demo',
            },
          },
          {
            key: 'motion',
            kind: 'animation',
            path: `${assetRoot}/motion.riv`,
            alt: 'Example animated illustration',
            preview: {
              path: `${assetRoot}/motion-preview.png`,
              alt: 'Example illustration',
            },
          },
        ],
      },
    ],
  }
}

async function createFixtureWorkspace() {
  const directory = await mkdtemp(join(tmpdir(), 'service-importer-'))
  temporaryDirectories.push(directory)
  const assetRoot = join(directory, 'makets/service-assets/example')
  await mkdir(assetRoot, { recursive: true })
  await Promise.all([
    writeFile(join(assetRoot, 'screen.png'), pngHeader(490, 1060)),
    writeFile(join(assetRoot, 'demo.mp4'), mp4Header()),
    writeFile(join(assetRoot, 'demo-preview.webp'), webpHeader(720, 1280)),
    writeFile(join(assetRoot, 'motion.riv'), Buffer.from('RIVE\x07\x03\x00\x00', 'binary')),
    writeFile(join(assetRoot, 'motion-preview.png'), pngHeader(512, 512)),
  ])
  return { directory, assetRoot }
}

const inspectVideo = async () => ({ codec: 'h264', width: 720, height: 1280, duration: 29.87 })

function emptyState() {
  return {
    version: 1,
    manifestVersion: 2,
    assets: {},
    services: {},
    supersededMediaAssetIds: [],
    supersededProviderAssetIds: [],
    mediaCompletedAt: null,
    completedAt: null,
  }
}

function createMediaApiHarness() {
  const calls = { signatures: [], uploads: [], registrations: [], gets: [], updates: [] }
  const assetsById = new Map()
  let sequence = 0
  const api = {
    async getMediaAsset(id) {
      calls.gets.push(id)
      return assetsById.get(id) ?? null
    },
    async createUploadDescriptor(kind) {
      calls.signatures.push(kind)
      return { provider: 'cloudinary', kind, upload: { method: 'POST', fields: {} } }
    },
    async uploadToProvider(descriptor, asset) {
      calls.uploads.push({ kind: descriptor.kind, key: asset.key })
      return { provider: 'cloudinary', providerAssetId: `provider-${asset.key}-${sequence += 1}` }
    },
    async registerMediaAsset(payload) {
      calls.registrations.push(payload)
      const id = `media-${sequence}`
      assetsById.set(id, {
        id,
        kind: payload.kind,
        alt: payload.alt,
        previewAsset: payload.previewAsset ?? null,
        status: 'active',
      })
      return { id }
    },
    async updateMediaAsset(id, update) {
      calls.updates.push({ id, update })
      const existing = assetsById.get(id)
      assetsById.set(id, { ...existing, ...update })
      return assetsById.get(id)
    },
  }
  return { api, calls, assetsById }
}

describe('service importer', () => {
  it('contains the approved content, project mappings, and independent showcases', () => {
    assert.equal(serviceImportManifest.version, 2)
    assert.equal(
      serviceImportManifest.services.reduce((total, service) => total + service.showcase.length, 0),
      11,
    )
    assert.equal(
      serviceImportManifest.services.reduce(
        (total, service) => total + service.showcase.filter(({ preview }) => preview).length,
        0,
      ),
      4,
    )
    assert.deepEqual(
      serviceImportManifest.services.map(({ content, relatedProjectSlugs, showcase }) => ({
        slug: content.slug,
        relatedProjectSlugs,
        showcase: showcase.map(({ key }) => key),
      })),
      [
        {
          slug: 'product-ui-ux',
          relatedProjectSlugs: ['unicon', 'supersauced', 'domsot'],
          showcase: ['promo-centennial', 'discovery', 'launch', 'students', 'notifications'],
        },
        {
          slug: 'mobile-development',
          relatedProjectSlugs: ['unicon', 'supersauced'],
          showcase: ['feed', 'discovery'],
        },
        {
          slug: 'web-development',
          relatedProjectSlugs: ['domsot', 'unicon'],
          showcase: ['centennial', 'domsot'],
        },
        {
          slug: 'backend-architecture',
          relatedProjectSlugs: ['unicon', 'supersauced', 'domsot'],
          showcase: ['allergies', 'settings'],
        },
      ],
    )
  })

  it('validates image, video, animation, and preview files offline', async () => {
    const { directory } = await createFixtureWorkspace()
    const plan = await buildServiceImportPlan(minimalManifest(), {
      workspaceRoot: directory,
      inspectVideo,
    })

    assert.equal(plan.services.length, 1)
    assert.equal(plan.services[0].showcase.length, 3)
    assert.equal(plan.assets.length, 5)
    assert.equal(plan.assets.find(({ key }) => key === 'example.screen').width, 490)
    assert.equal(plan.assets.find(({ key }) => key === 'example.demo').duration, 29.87)
    assert.equal(plan.assets.find(({ key }) => key === 'example.demo.preview').format, 'webp')
    assert.equal(plan.assets.find(({ key }) => key === 'example.motion').format, 'riv')
    assert.ok(plan.assets.every(({ sha256 }) => /^[a-f\d]{64}$/.test(sha256)))
    assert.equal(isServiceImportPlanPublishable(plan), true)
  })

  it('rejects invalid ownership mappings and motion preview declarations', async () => {
    const { directory } = await createFixtureWorkspace()

    const duplicateProject = minimalManifest()
    duplicateProject.services[0].relatedProjectSlugs = ['unicon', 'unicon']
    await assert.rejects(
      buildServiceImportPlan(duplicateProject, { workspaceRoot: directory, inspectVideo }),
      /Duplicate related project slug/,
    )

    const missingPreview = minimalManifest()
    delete missingPreview.services[0].showcase[1].preview
    await assert.rejects(
      buildServiceImportPlan(missingPreview, { workspaceRoot: directory, inspectVideo }),
      /Preview is required/,
    )

    const imagePreview = minimalManifest()
    imagePreview.services[0].showcase[0].preview = {
      path: 'makets/service-assets/example/motion-preview.png',
      alt: 'Unsupported image preview',
    }
    await assert.rejects(
      buildServiceImportPlan(imagePreview, { workspaceRoot: directory, inspectVideo }),
      /Preview is not supported/,
    )
  })

  it('rejects unsafe, missing, and incorrectly encoded local assets', async () => {
    const { directory, assetRoot } = await createFixtureWorkspace()

    const unsafe = minimalManifest()
    unsafe.services[0].showcase[0].path = '../outside.png'
    await assert.rejects(
      buildServiceImportPlan(unsafe, { workspaceRoot: directory, inspectVideo }),
      /must stay inside makets\/service-assets/,
    )

    const missing = minimalManifest()
    missing.services[0].showcase[0].path = 'makets/service-assets/example/missing.png'
    await assert.rejects(
      buildServiceImportPlan(missing, { workspaceRoot: directory, inspectVideo }),
      /Asset file is missing/,
    )

    await writeFile(join(assetRoot, 'screen.png'), Buffer.from('not a png'))
    await assert.rejects(
      buildServiceImportPlan(minimalManifest(), { workspaceRoot: directory, inspectVideo }),
      /not a valid PNG/,
    )
  })

  it('stores resumable import state atomically with owner-only permissions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'service-import-state-'))
    temporaryDirectories.push(directory)
    const statePath = join(directory, 'output/service-import-state.json')
    const state = emptyState()
    state.assets.example = { sha256: 'abc', kind: 'image' }

    await saveServiceImportState(statePath, state)
    const metadata = await stat(statePath)
    const loaded = await loadServiceImportState(statePath, 2)

    assert.equal(metadata.mode & 0o777, 0o600)
    assert.deepEqual(loaded, state)
    await assert.rejects(loadServiceImportState(statePath, 3), /manifest version does not match/)

    const legacyState = { ...state, completedAt: '2026-10-21T12:00:00.000Z' }
    delete legacyState.services
    delete legacyState.mediaCompletedAt
    await saveServiceImportState(statePath, legacyState)
    const migrated = await loadServiceImportState(statePath, 2)
    assert.deepEqual(migrated.services, {})
    assert.equal(migrated.mediaCompletedAt, '2026-10-21T12:00:00.000Z')
    assert.equal(migrated.completedAt, null)
  })

  it('uploads previews before motion media and reuses registered assets on rerun', async () => {
    const { directory } = await createFixtureWorkspace()
    const plan = await buildServiceImportPlan(minimalManifest(), {
      workspaceRoot: directory,
      inspectVideo,
    })
    const state = emptyState()
    const statePath = join(directory, 'output/service-import-state.json')
    const { api, calls } = createMediaApiHarness()
    const progress = []

    const firstIds = await uploadServiceMediaPlan({
      api,
      plan,
      state,
      statePath,
      saveState: async () => {},
      onProgress: ({ asset, action }) => progress.push({ key: asset.key, action }),
      now: () => new Date('2026-10-21T12:00:00.000Z'),
    })

    assert.deepEqual(
      calls.uploads.map(({ key }) => key),
      [
        'example.screen',
        'example.demo.preview',
        'example.motion.preview',
        'example.demo',
        'example.motion',
      ],
    )
    assert.deepEqual(calls.signatures, ['image', 'image', 'image', 'video', 'animation'])
    assert.equal(
      calls.registrations.find(({ kind }) => kind === 'video').previewAsset,
      firstIds['example.demo.preview'],
    )
    assert.equal(
      calls.registrations.find(({ kind }) => kind === 'animation').previewAsset,
      firstIds['example.motion.preview'],
    )
    assert.equal(state.mediaCompletedAt, '2026-10-21T12:00:00.000Z')
    assert.ok(progress.every(({ action }) => action === 'registered'))

    const uploadCount = calls.uploads.length
    const registrationCount = calls.registrations.length
    plan.assets.find(({ key }) => key === 'example.screen').alt = 'Updated accessible screen'
    await uploadServiceMediaPlan({
      api,
      plan,
      state,
      statePath,
      saveState: async () => {},
    })

    assert.equal(calls.uploads.length, uploadCount)
    assert.equal(calls.registrations.length, registrationCount)
    assert.deepEqual(calls.updates.at(-1).update, { alt: 'Updated accessible screen' })
  })

  it('resumes provider uploads and records replaced assets without deleting them', async () => {
    const { directory } = await createFixtureWorkspace()
    const plan = await buildServiceImportPlan(minimalManifest(), {
      workspaceRoot: directory,
      inspectVideo,
    })
    const screen = plan.assets.find(({ key }) => key === 'example.screen')
    const state = emptyState()
    state.assets[screen.key] = {
      sha256: screen.sha256,
      kind: screen.kind,
      path: screen.path,
      provider: 'cloudinary',
      providerAssetId: 'provider-resumed-screen',
    }
    const { api, calls } = createMediaApiHarness()

    await uploadServiceMediaPlan({
      api,
      plan,
      state,
      statePath: join(directory, 'state.json'),
      saveState: async () => {},
    })

    assert.equal(calls.uploads.some(({ key }) => key === screen.key), false)
    assert.equal(calls.registrations[0].providerAssetId, 'provider-resumed-screen')

    const previous = { ...state.assets[screen.key] }
    screen.sha256 = 'f'.repeat(64)
    await uploadServiceMediaPlan({
      api,
      plan,
      state,
      statePath: join(directory, 'state.json'),
      saveState: async () => {},
    })

    assert.ok(state.supersededMediaAssetIds.includes(previous.mediaAssetId))
    assert.ok(state.supersededProviderAssetIds.includes(previous.providerAssetId))
    assert.notEqual(state.assets[screen.key].mediaAssetId, previous.mediaAssetId)
  })

  it('resolves published project dependencies and builds ordered service payloads', async () => {
    const { directory } = await createFixtureWorkspace()
    const plan = await buildServiceImportPlan(minimalManifest(), {
      workspaceRoot: directory,
      inspectVideo,
    })
    const project = {
      id: 'project-unicon',
      slug: 'unicon',
      status: 'published',
      logoAsset: 'logo-unicon',
    }
    const context = createServiceImportContext(plan, [project], [])
    const mediaAssetIds = Object.fromEntries(
      plan.assets.map(({ key }) => [key, `media-${key}`]),
    )
    const payload = buildServicePayload(plan.services[0], mediaAssetIds, context)

    assert.equal(payload.status, 'draft')
    assert.deepEqual(payload.relatedProjects, ['project-unicon'])
    assert.deepEqual(
      payload.showcaseAssets,
      plan.services[0].showcase.map(({ assetKey }) => `media-${assetKey}`),
    )
    await validateServiceProjectLogos({
      api: { getMediaAsset: async () => ({ status: 'active', kind: 'image' }) },
      context,
    })
    await assert.rejects(
      validateServiceProjectLogos({
        api: { getMediaAsset: async () => ({ status: 'inactive', kind: 'image' }) },
        context,
      }),
      /project logo is missing, inactive, or not an image/,
    )

    assert.throws(
      () => createServiceImportContext(plan, [], []),
      /Required project is missing: unicon/,
    )
    assert.throws(
      () =>
        createServiceImportContext(
          plan,
          [project],
          Array.from({ length: 4 }, (_, index) => ({
            id: `outside-${index}`,
            slug: `outside-${index}`,
            status: 'published',
            home: { featured: true },
          })),
        ),
      /would exceed the four-service limit/,
    )
  })

  it('creates, updates, and reuses complete service drafts idempotently', async () => {
    const { directory } = await createFixtureWorkspace()
    const plan = await buildServiceImportPlan(minimalManifest(), {
      workspaceRoot: directory,
      inspectVideo,
    })
    const project = {
      id: 'project-unicon',
      slug: 'unicon',
      status: 'published',
      logoAsset: 'logo-unicon',
    }
    const mediaAssetIds = Object.fromEntries(
      plan.assets.map(({ key }) => [key, `media-${key}`]),
    )
    const emptyContext = createServiceImportContext(plan, [project], [])
    const payload = buildServicePayload(plan.services[0], mediaAssetIds, emptyContext)
    const calls = { creates: [], updates: [] }
    const api = {
      async createService(input) {
        calls.creates.push(input)
        return { id: 'service-example', ...input }
      },
      async updateService(id, input) {
        calls.updates.push({ id, input })
        return { id, ...input }
      },
    }
    const state = emptyState()
    const options = {
      api,
      plan,
      mediaAssetIds,
      state,
      statePath: join(directory, 'state.json'),
      saveState: async () => {},
    }

    const created = await applyServiceDrafts({ ...options, context: emptyContext })
    assert.equal(created[0].status, 'draft')
    assert.equal(calls.creates.length, 1)

    const published = { id: 'service-example', ...payload, status: 'published' }
    const matchingContext = createServiceImportContext(plan, [project], [published])
    const reusedActions = []
    const reused = await applyServiceDrafts({
      ...options,
      context: matchingContext,
      onProgress: ({ action }) => reusedActions.push(action),
    })
    assert.equal(reused[0].status, 'published')
    assert.deepEqual(reusedActions, ['reused'])
    assert.equal(calls.updates.length, 0)

    const changedContext = createServiceImportContext(
      plan,
      [project],
      [{ ...published, description: 'Outdated description' }],
    )
    const updated = await applyServiceDrafts({ ...options, context: changedContext })
    assert.equal(updated[0].status, 'draft')
    assert.equal(calls.updates.length, 1)
    assert.deepEqual(state.services.example, {
      serviceId: 'service-example',
      status: 'draft',
    })
  })

  it('publishes only remaining drafts and checkpoints every service', async () => {
    const state = emptyState()
    const savedStatuses = []
    const calls = []
    const services = [
      { id: 'service-one', slug: 'one', status: 'draft' },
      { id: 'service-two', slug: 'two', status: 'published' },
    ]

    const published = await publishServiceDrafts({
      api: {
        async updateService(id, input) {
          calls.push({ id, input })
          return { id, slug: 'one', status: input.status }
        },
      },
      services,
      state,
      statePath: '/ignored/state.json',
      saveState: async (_path, snapshot) => {
        savedStatuses.push({ ...snapshot.services })
      },
    })

    assert.deepEqual(calls, [{ id: 'service-one', input: { status: 'published' } }])
    assert.deepEqual(
      published.map(({ status }) => status),
      ['published', 'published'],
    )
    assert.equal(state.services.one.status, 'published')
    assert.equal(state.services.two.status, 'published')
    assert.equal(savedStatuses.length, 2)
    assert.equal(state.completedAt, null)
  })

  it('verifies public ordering, relationships, media order, and motion previews', async () => {
    const { directory } = await createFixtureWorkspace()
    const plan = await buildServiceImportPlan(minimalManifest(), {
      workspaceRoot: directory,
      inspectVideo,
    })
    const mediaAssetIds = Object.fromEntries(
      plan.assets.map(({ key }) => [key, `media-${key}`]),
    )
    const service = plan.services[0]

    const result = await verifyPublicServiceImport({
      api: {
        async listPublicServices(placement) {
          return placement === 'home'
            ? [{ slug: service.content.slug }]
            : [{ slug: 'outside' }, { slug: service.content.slug }]
        },
        async getPublicService() {
          return {
            slug: service.content.slug,
            title: service.content.title,
            description: service.content.description,
            icon: service.content.icon,
            tone: service.content.tone,
            capabilities: service.content.capabilities,
            tools: service.content.tools,
            relatedProjects: service.relatedProjectSlugs.map((slug) => ({ slug })),
            showcaseAssets: service.showcase.map((item) => {
              const asset = plan.assets.find(({ key }) => key === item.assetKey)
              const preview = plan.assets.find(({ key }) => key === item.previewAssetKey)
              return {
                id: mediaAssetIds[item.assetKey],
                kind: item.kind,
                format: asset.format,
                alt: asset.alt,
                width: asset.width ?? null,
                height: asset.height ?? null,
                duration: item.kind === 'video' ? asset.duration : null,
                url: `https://media.example.com/${item.assetKey}`,
                preview: preview
                  ? {
                      id: mediaAssetIds[item.previewAssetKey],
                      alt: preview.alt,
                      width: preview.width,
                      height: preview.height,
                      url: `https://media.example.com/${item.previewAssetKey}`,
                    }
                  : null,
              }
            }),
          }
        },
      },
      plan,
      mediaAssetIds,
    })

    assert.deepEqual(result, { serviceCount: 1 })
  })

  it('requests kind-specific signatures and sends correct MIME types without the admin cookie', async () => {
    const { assetRoot } = await createFixtureWorkspace()
    const calls = []
    const uploadedTypes = []
    const jsonResponse = (body, init) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { 'content-type': 'application/json', ...init?.headers },
      })
    const fetchImplementation = async (url, options) => {
      calls.push({ url, options })
      if (url.endsWith('/auth/login')) {
        return jsonResponse(
          { success: true, data: { id: 'admin-id', displayName: 'Owner' } },
          { headers: { 'set-cookie': 'cd_admin_session=opaque-token; HttpOnly; Path=/api/v1' } },
        )
      }
      if (url.endsWith('/admin/media/upload-signature')) {
        const { kind } = JSON.parse(options.body)
        return jsonResponse({
          success: true,
          data: {
            provider: 'cloudinary',
            upload: {
              method: 'POST',
              url: `https://api.cloudinary.com/${kind}`,
              fields: { signature: `signed-${kind}` },
            },
          },
        })
      }
      if (url.startsWith('https://api.cloudinary.com/')) {
        uploadedTypes.push(options.body.get('file').type)
        return jsonResponse({ asset_id: `provider-${uploadedTypes.length}` })
      }
      if (url.endsWith('/services?placement=home')) {
        return jsonResponse({ success: true, data: [{ slug: 'example' }] })
      }
      if (url.endsWith('/services/example')) {
        return jsonResponse({ success: true, data: { slug: 'example' } })
      }
      if (url.endsWith('/auth/logout')) return jsonResponse({ success: true })
      throw new Error(`Unexpected test request: ${url}`)
    }
    const api = createImportApiClient({
      baseUrl: 'https://api.example.com',
      origin: 'https://portfolio.example.com',
      fetchImplementation,
    })

    await api.login({ email: 'owner@example.com', password: 'not-a-real-password' })
    for (const asset of [
      { kind: 'image', format: 'webp', filename: 'demo-preview.webp' },
      { kind: 'video', format: 'mp4', filename: 'demo.mp4' },
      { kind: 'animation', format: 'riv', filename: 'motion.riv' },
    ]) {
      const descriptor = await api.createUploadDescriptor(asset.kind)
      await api.uploadToProvider(descriptor, {
        ...asset,
        absolutePath: join(assetRoot, asset.filename),
      })
    }
    assert.deepEqual(await api.listPublicServices('home'), [{ slug: 'example' }])
    assert.deepEqual(await api.getPublicService('example'), { slug: 'example' })
    await api.logout()

    assert.deepEqual(uploadedTypes, ['image/webp', 'video/mp4', 'application/octet-stream'])
    const providerCalls = calls.filter(({ url }) => url.startsWith('https://api.cloudinary.com/'))
    assert.ok(providerCalls.every(({ options }) => options.headers === undefined))
    const publicCalls = calls.filter(({ url }) => url.includes('/api/v1/services'))
    assert.ok(publicCalls.every(({ options }) => options.headers.cookie === undefined))
    const signatureCalls = calls.filter(({ url }) => url.endsWith('/admin/media/upload-signature'))
    assert.deepEqual(
      signatureCalls.map(({ options }) => JSON.parse(options.body).kind),
      ['image', 'video', 'animation'],
    )
  })
})
