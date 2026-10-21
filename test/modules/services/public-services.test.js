import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import mongoose from 'mongoose'
import createError from 'http-errors'

import { createApp } from '../../../src/app.js'
import { loadEnvironment } from '../../../src/config/environment.js'
import { createPublicServiceService } from '../../../src/modules/services/public/public-service-service.js'

const serviceId = '68e7b0000000000000000001'
const projectId = '68e7b0000000000000000010'

function mediaAsset(suffix, overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(`68e7b00000000000000000${suffix}`),
    provider: 'cloudinary',
    kind: 'image',
    secureUrl: `https://res.cloudinary.com/example/image/upload/service-${suffix}.webp`,
    resourceType: 'image',
    format: 'webp',
    width: 800,
    height: 1200,
    alt: `Service showcase ${suffix}`,
    status: 'active',
    ...overrides,
  }
}

function publicService(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(serviceId),
    slug: 'product-ui-ux',
    title: 'Product & UI/UX Design',
    description: 'Designing clear, user-friendly experiences.',
    icon: 'product-ui-ux',
    tone: 'product',
    status: 'published',
    home: { featured: true, order: 1 },
    servicesPageOrder: 1,
    publishedAt: new Date('2026-10-14T12:00:00.000Z'),
    createdAt: new Date('2026-10-14T12:00:00.000Z'),
    updatedAt: new Date('2026-10-14T12:00:00.000Z'),
    ...overrides,
  }
}

function publicServiceDetail(overrides = {}) {
  const preview = mediaAsset(20, { alt: 'Motion preview' })
  return publicService({
    capabilities: ['User Flows', 'Wireframes', 'Prototypes'],
    tools: [
      { key: 'jitter', label: 'Jitter' },
      { key: 'rive', label: 'Rive' },
      { key: 'figma', label: 'Figma' },
    ],
    relatedProjects: [
      {
        _id: new mongoose.Types.ObjectId(projectId),
        slug: 'unicon',
        title: 'Unicon',
        logoAsset: mediaAsset(21, { alt: 'Unicon logo', width: 512, height: 512 }),
      },
    ],
    showcaseAssets: [
      mediaAsset(11),
      mediaAsset(12, {
        kind: 'video',
        secureUrl: 'https://res.cloudinary.com/example/video/upload/promo.mp4',
        resourceType: 'video',
        format: 'mp4',
        width: 720,
        height: 1280,
        duration: 29.87,
        previewAsset: preview,
      }),
      mediaAsset(13, {
        kind: 'animation',
        secureUrl: 'https://res.cloudinary.com/example/raw/upload/interaction.riv',
        resourceType: 'raw',
        format: 'riv',
        width: undefined,
        height: undefined,
        previewAsset: preview,
      }),
      mediaAsset(14),
      mediaAsset(15),
    ],
    ...overrides,
  })
}

async function requestJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`)
  const body = await response.json()
  return { response, body }
}

describe('public service HTTP contract', () => {
  let baseUrl
  let server
  let calls

  const publicServiceService = {
    async listServices(query) {
      calls.list.push(query)
      return [publicService()]
    },
    async getServiceBySlug(slug) {
      calls.detail.push(slug)
      if (slug === 'missing-service') throw createError(404, 'Service not found')
      return publicServiceDetail()
    },
  }
  const mediaService = {
    createDeliveryUrl(asset, preset) {
      calls.media.push({ id: asset._id.toString(), preset })
      return `${asset.secureUrl}?preset=${preset}`
    },
  }

  before(async () => {
    const environment = loadEnvironment({ NODE_ENV: 'test' })
    const app = createApp({ environment, publicServiceService, mediaService })

    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1')
      server.once('listening', resolve)
      server.once('error', reject)
    })

    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  beforeEach(() => {
    calls = { list: [], detail: [], media: [] }
  })

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('returns a cacheable explicit public list', async () => {
    const { response, body } = await requestJson(baseUrl, '/api/v1/services')

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'public, max-age=0, s-maxage=60, stale-while-revalidate=300')
    assert.equal(response.headers.get('cdn-cache-control'), 'max-age=60, stale-while-revalidate=300')
    assert.deepEqual(calls.list.at(-1), {})
    assert.deepEqual(body.data[0], {
      id: serviceId,
      slug: 'product-ui-ux',
      title: 'Product & UI/UX Design',
      description: 'Designing clear, user-friendly experiences.',
      icon: 'product-ui-ux',
      tone: 'product',
      home: { featured: true },
    })
  })

  it('passes Home placement and rejects unknown queries without caching errors', async () => {
    const home = await requestJson(baseUrl, '/api/v1/services?placement=home')
    assert.equal(home.response.status, 200)
    assert.deepEqual(calls.list.at(-1), { placement: 'home' })

    const invalidPlacement = await requestJson(baseUrl, '/api/v1/services?placement=archive')
    assert.equal(invalidPlacement.response.status, 400)
    assert.equal(invalidPlacement.response.headers.get('cache-control'), null)

    const unknown = await requestJson(baseUrl, '/api/v1/services?unexpected=true')
    assert.equal(unknown.response.status, 400)
    assert.equal(unknown.response.headers.get('cache-control'), null)
  })

  it('returns a composed cacheable service detail with universal showcase media', async () => {
    const { response, body } = await requestJson(baseUrl, '/api/v1/services/product-ui-ux')

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'public, max-age=0, s-maxage=60, stale-while-revalidate=300')
    assert.equal(response.headers.get('cdn-cache-control'), 'max-age=60, stale-while-revalidate=300')
    assert.deepEqual(calls.detail, ['product-ui-ux'])
    assert.deepEqual(body.data.capabilities, ['User Flows', 'Wireframes', 'Prototypes'])
    assert.deepEqual(body.data.tools[2], { key: 'figma', label: 'Figma' })
    assert.deepEqual(body.data.relatedProjects[0], {
      id: projectId,
      slug: 'unicon',
      title: 'Unicon',
      logo: {
        id: '68e7b0000000000000000021',
        url: 'https://res.cloudinary.com/example/image/upload/service-21.webp?preset=logo',
        alt: 'Unicon logo',
        width: 512,
        height: 512,
      },
    })
    assert.equal(body.data.showcaseAssets.length, 5)
    assert.equal(body.data.showcaseAssets[0].kind, 'image')
    assert.equal(body.data.showcaseAssets[0].preview, null)
    assert.equal(body.data.showcaseAssets[1].kind, 'video')
    assert.equal(body.data.showcaseAssets[1].duration, 29.87)
    assert.equal(body.data.showcaseAssets[1].preview.alt, 'Motion preview')
    assert.equal(body.data.showcaseAssets[2].kind, 'animation')
    assert.equal(body.data.showcaseAssets[2].width, null)
    assert.equal(body.data.showcaseAssets[2].preview.alt, 'Motion preview')
    assert.equal('status' in body.data, false)
    assert.equal('publishedAt' in body.data, false)
    assert.equal(JSON.stringify(body).includes('providerAssetId'), false)
    assert.deepEqual(
      calls.media.map(({ preset }) => preset),
      [
        'logo',
        'serviceShowcaseImage',
        'serviceShowcaseVideo',
        'serviceShowcaseImage',
        'animation',
        'serviceShowcaseImage',
        'serviceShowcaseImage',
        'serviceShowcaseImage',
      ],
    )
  })

  it('rejects invalid detail input and does not cache missing services', async () => {
    const invalidSlug = await requestJson(baseUrl, '/api/v1/services/Invalid_Slug')
    assert.equal(invalidSlug.response.status, 400)
    assert.equal(invalidSlug.response.headers.get('cache-control'), null)

    const unknownQuery = await requestJson(baseUrl, '/api/v1/services/product-ui-ux?unexpected=true')
    assert.equal(unknownQuery.response.status, 400)
    assert.equal(unknownQuery.response.headers.get('cache-control'), null)

    const missing = await requestJson(baseUrl, '/api/v1/services/missing-service')
    assert.equal(missing.response.status, 404)
    assert.equal(missing.response.headers.get('cache-control'), null)
  })
})

function createQueryHarness(result) {
  const state = { select: undefined, sort: undefined, population: [] }
  const query = {
    select(fields) {
      state.select = fields
      return this
    },
    sort(specification) {
      state.sort = specification
      return this
    },
    populate(specification) {
      state.population.push(specification)
      return this
    },
    lean() {
      return Promise.resolve(result)
    },
  }
  return { query, state }
}

describe('public service service', () => {
  it('filters and sorts published Services and Home lists deterministically', async () => {
    const queries = []
    const serviceModel = {
      find(filter) {
        const harness = createQueryHarness([publicService()])
        queries.push({ filter, ...harness })
        return harness.query
      },
      findOne(filter) {
        const incompleteProject = { slug: 'archived', title: 'Archived', logoAsset: null }
        const harness = createQueryHarness(
          publicServiceDetail({
            relatedProjects: [...publicServiceDetail().relatedProjects, incompleteProject],
          }),
        )
        queries.push({ filter, ...harness })
        return harness.query
      },
    }
    const service = createPublicServiceService({ serviceModel })

    await service.listServices({})
    await service.listServices({ placement: 'home' })

    assert.deepEqual(queries[0].filter, { status: 'published' })
    assert.deepEqual(queries[0].state.sort, { servicesPageOrder: 1, _id: 1 })
    assert.deepEqual(queries[1].filter, { status: 'published', 'home.featured': true })
    assert.deepEqual(queries[1].state.sort, { 'home.order': 1, _id: 1 })
    assert.equal(queries[0].state.select.includes('status'), false)
    assert.equal(queries[0].state.select.includes('home.order'), false)
  })

  it('loads complete published detail and filters projects without an active logo', async () => {
    const queries = []
    const serviceModel = {
      find() {
        throw new Error('List query was not expected')
      },
      findOne(filter) {
        const incompleteProject = { slug: 'archived', title: 'Archived', logoAsset: null }
        const harness = createQueryHarness(
          publicServiceDetail({
            relatedProjects: [...publicServiceDetail().relatedProjects, incompleteProject],
          }),
        )
        queries.push({ filter, ...harness })
        return harness.query
      },
    }
    const service = createPublicServiceService({ serviceModel })

    const result = await service.getServiceBySlug('product-ui-ux')

    assert.deepEqual(queries[0].filter, { slug: 'product-ui-ux', status: 'published' })
    assert.equal(queries[0].state.select.includes('status'), false)
    assert.deepEqual(
      queries[0].state.population.map(({ path }) => path),
      ['relatedProjects', 'showcaseAssets'],
    )
    assert.equal(queries[0].state.population[0].match.status, 'published')
    assert.equal(queries[0].state.population[1].match.status, 'active')
    assert.deepEqual(result.relatedProjects.map(({ slug }) => slug), ['unicon'])
    assert.deepEqual(
      result.showcaseAssets.map(({ _id }) => _id.toString()),
      [11, 12, 13, 14, 15].map((suffix) => `68e7b00000000000000000${suffix}`),
    )
  })

  it('hides missing and incomplete service detail behind the same 404', async () => {
    for (const result of [
      null,
      publicServiceDetail({ showcaseAssets: publicServiceDetail().showcaseAssets.slice(0, 4) }),
      publicServiceDetail({ relatedProjects: [] }),
      publicServiceDetail({
        showcaseAssets: publicServiceDetail().showcaseAssets.map((asset, index) =>
          index === 1 ? { ...asset, previewAsset: null } : asset,
        ),
      }),
    ]) {
      const serviceModel = {
        findOne() {
          return createQueryHarness(result).query
        },
      }
      const service = createPublicServiceService({ serviceModel })
      await assert.rejects(service.getServiceBySlug('product-ui-ux'), (error) => {
        assert.equal(error.status, 404)
        assert.equal(error.message, 'Service not found')
        return true
      })
    }
  })
})
