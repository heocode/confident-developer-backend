import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import mongoose from 'mongoose'

import { createApp } from '../../../src/app.js'
import { loadEnvironment } from '../../../src/config/environment.js'
import { createPublicServiceService } from '../../../src/modules/services/public/public-service-service.js'

const serviceId = '68e7b0000000000000000001'

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
      calls.push(query)
      return [publicService()]
    },
  }

  before(async () => {
    const environment = loadEnvironment({ NODE_ENV: 'test' })
    const app = createApp({ environment, publicServiceService })

    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1')
      server.once('listening', resolve)
      server.once('error', reject)
    })

    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  beforeEach(() => {
    calls = []
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
    assert.deepEqual(calls.at(-1), {})
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
    assert.deepEqual(calls.at(-1), { placement: 'home' })

    const invalidPlacement = await requestJson(baseUrl, '/api/v1/services?placement=archive')
    assert.equal(invalidPlacement.response.status, 400)
    assert.equal(invalidPlacement.response.headers.get('cache-control'), null)

    const unknown = await requestJson(baseUrl, '/api/v1/services?unexpected=true')
    assert.equal(unknown.response.status, 400)
    assert.equal(unknown.response.headers.get('cache-control'), null)
  })
})

function createQueryHarness(result) {
  const state = { select: undefined, sort: undefined }
  const query = {
    select(fields) {
      state.select = fields
      return this
    },
    sort(specification) {
      state.sort = specification
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
})
