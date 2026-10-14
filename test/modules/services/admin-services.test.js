import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import mongoose from 'mongoose'

import { createApp } from '../../../src/app.js'
import { loadEnvironment } from '../../../src/config/environment.js'
import { createAdminServiceService } from '../../../src/modules/services/admin/admin-service-service.js'
import { serializeAdminService } from '../../../src/modules/services/admin/admin-service-serializer.js'
import { PortfolioService } from '../../../src/modules/services/portfolio-service.js'

const frontendOrigin = 'http://localhost:5173'
const sessionCookie = 'cd_admin_session=service-session-token'
const serviceId = '68e7a0000000000000000001'

function serviceData(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(serviceId),
    slug: 'mobile-development',
    title: 'Mobile Development',
    description: 'Building smooth, reliable mobile experiences.',
    icon: 'mobile-development',
    tone: 'mobile',
    status: 'draft',
    home: { featured: true, order: 2 },
    servicesPageOrder: 2,
    createdAt: new Date('2026-10-14T12:00:00.000Z'),
    updatedAt: new Date('2026-10-14T12:00:00.000Z'),
    ...overrides,
  }
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const body = await response.json()
  return { response, body }
}

describe('admin service HTTP contract', () => {
  let baseUrl
  let server
  let calls

  const authService = {
    async getAdminForToken(token) {
      if (token !== 'service-session-token') {
        const error = new Error('Authentication required')
        error.status = 401
        throw error
      }

      return { id: 'admin-id', displayName: 'Owner', email: 'owner@example.com' }
    },
  }

  const serviceService = {
    async createService(input) {
      calls.create.push(input)
      return serviceData(input)
    },
    async listServices(query) {
      calls.list.push(query)
      return [serviceData()]
    },
    async getService(id) {
      calls.get.push(id)
      return serviceData()
    },
    async updateService(id, input) {
      calls.update.push({ id, input })
      return serviceData({ ...input, updatedAt: new Date('2026-10-15T12:00:00.000Z') })
    },
    async deleteService(id) {
      calls.delete.push(id)
    },
  }

  before(async () => {
    const environment = loadEnvironment({ NODE_ENV: 'test', CLIENT_ORIGINS: frontendOrigin })
    const app = createApp({ environment, authService, serviceService })

    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1')
      server.once('listening', resolve)
      server.once('error', reject)
    })

    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  beforeEach(() => {
    calls = { create: [], list: [], get: [], update: [], delete: [] }
  })

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('requires an admin session and a trusted origin for writes', async () => {
    const unauthenticated = await requestJson(baseUrl, '/api/v1/admin/services')
    assert.equal(unauthenticated.response.status, 401)

    const missingOrigin = await requestJson(baseUrl, '/api/v1/admin/services', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'mobile-development', title: 'Mobile Development' }),
    })
    assert.equal(missingOrigin.response.status, 403)
  })

  it('creates a draft through an explicit admin serializer', async () => {
    const payload = {
      slug: 'mobile-development',
      title: 'Mobile Development',
      icon: 'mobile-development',
      tone: 'mobile',
      home: { featured: true, order: 2 },
    }
    const { response, body } = await requestJson(baseUrl, '/api/v1/admin/services', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
        origin: frontendOrigin,
      },
      body: JSON.stringify(payload),
    })

    assert.equal(response.status, 201)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(body.data.id, serviceId)
    assert.equal(body.data.icon, 'mobile-development')
    assert.equal('_id' in body.data, false)
    assert.equal('__v' in body.data, false)
    assert.deepEqual(calls.create.at(-1), payload)
  })

  it('lists, retrieves, updates, and deletes services', async () => {
    const list = await requestJson(baseUrl, '/api/v1/admin/services?status=draft', {
      headers: { cookie: sessionCookie },
    })
    assert.equal(list.response.status, 200)
    assert.deepEqual(calls.list.at(-1), { status: 'draft' })

    const get = await requestJson(baseUrl, `/api/v1/admin/services/${serviceId}`, {
      headers: { cookie: sessionCookie },
    })
    assert.equal(get.body.data.slug, 'mobile-development')

    const update = await requestJson(baseUrl, `/api/v1/admin/services/${serviceId}`, {
      method: 'PATCH',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
        origin: frontendOrigin,
      },
      body: JSON.stringify({ description: 'Updated description', home: { order: 3 } }),
    })
    assert.equal(update.response.status, 200)
    assert.deepEqual(calls.update.at(-1), {
      id: serviceId,
      input: { description: 'Updated description', home: { order: 3 } },
    })

    const deletion = await requestJson(baseUrl, `/api/v1/admin/services/${serviceId}`, {
      method: 'DELETE',
      headers: { cookie: sessionCookie, origin: frontendOrigin },
    })
    assert.equal(deletion.response.status, 200)
    assert.equal(calls.delete.at(-1), serviceId)
  })

  it('rejects malformed IDs, unknown presentation keys, empty patches, and server-owned fields', async () => {
    const malformedId = await requestJson(baseUrl, '/api/v1/admin/services/not-an-id', {
      headers: { cookie: sessionCookie },
    })
    assert.equal(malformedId.response.status, 400)

    for (const body of [
      {},
      { icon: '/src/assets/icons/services/mobile.svg' },
      { tone: '#ff0000' },
      { publishedAt: '2026-10-14T12:00:00.000Z' },
      { home: {} },
    ]) {
      const result = await requestJson(baseUrl, `/api/v1/admin/services/${serviceId}`, {
        method: 'PATCH',
        headers: {
          cookie: sessionCookie,
          'content-type': 'application/json',
          origin: frontendOrigin,
        },
        body: JSON.stringify(body),
      })
      assert.equal(result.response.status, 400)
    }
  })
})

describe('admin service serializer', () => {
  it('returns editable fields without persistence internals', () => {
    const serialized = serializeAdminService(new PortfolioService(serviceData()))

    assert.equal(serialized.id, serviceId)
    assert.deepEqual(serialized.home, { featured: true, order: 2 })
    assert.equal('_id' in serialized, false)
    assert.equal('__v' in serialized, false)
  })
})

function sessionResult(value) {
  return {
    session() {
      return Promise.resolve(value)
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject)
    },
  }
}

function publishedHomeService(overrides = {}) {
  return {
    slug: 'mobile-development',
    title: 'Mobile Development',
    description: 'Building smooth, reliable mobile experiences.',
    icon: 'mobile-development',
    tone: 'mobile',
    status: 'published',
    home: { featured: true, order: 2 },
    ...overrides,
  }
}

function createServiceHarness({ homeCount = 0, existingService = null } = {}) {
  const state = { saved: [], deleted: [], findFilter: undefined, sort: undefined }
  const session = { id: 'service-test-session' }

  function ServiceModel(values) {
    const service = new PortfolioService(values)
    service.save = async (options) => {
      state.saved.push({ service, options })
      return service
    }
    return service
  }

  ServiceModel.countDocuments = () => sessionResult(homeCount)
  ServiceModel.findById = () => sessionResult(existingService)
  ServiceModel.findByIdAndDelete = async (id) => {
    state.deleted.push(id)
    return existingService
  }
  ServiceModel.find = (filter) => {
    state.findFilter = filter
    return {
      sort(specification) {
        state.sort = specification
        return Promise.resolve(existingService ? [existingService] : [])
      },
    }
  }

  const service = createAdminServiceService({
    serviceModel: ServiceModel,
    runInTransaction: (operation) => operation(session),
    now: () => new Date('2026-10-14T15:00:00.000Z'),
  })

  return { service, session, state }
}

describe('admin service business logic', () => {
  it('assigns publishedAt and saves a fourth Home service transactionally', async () => {
    const { service, session, state } = createServiceHarness({ homeCount: 3 })

    const created = await service.createService(publishedHomeService())

    assert.equal(created.publishedAt.toISOString(), '2026-10-14T15:00:00.000Z')
    assert.equal(state.saved[0].options.session, session)
  })

  it('rejects a fifth published Home service', async () => {
    const { service, state } = createServiceHarness({ homeCount: 4 })

    await assert.rejects(service.createService(publishedHomeService()), (error) => {
      assert.equal(error.status, 409)
      assert.equal(error.message, 'Home cannot contain more than 4 services')
      return true
    })
    assert.equal(state.saved.length, 0)
  })

  it('merges partial Home placement updates', async () => {
    const existingService = new PortfolioService({
      slug: 'mobile-development',
      title: 'Mobile Development',
      home: { featured: true, order: 2 },
    })
    existingService.save = async () => existingService
    const { service } = createServiceHarness({ existingService })

    const updated = await service.updateService(existingService.id, { home: { order: 4 } })

    assert.deepEqual(updated.home.toObject(), { featured: true, order: 4 })
  })

  it('uses deterministic admin ordering and returns not-found errors', async () => {
    const existingService = new PortfolioService({ slug: 'mobile-development', title: 'Mobile Development' })
    const { service, state } = createServiceHarness({ existingService })

    const services = await service.listServices({ status: 'draft' })
    await service.deleteService(existingService.id)

    assert.equal(services[0], existingService)
    assert.deepEqual(state.findFilter, { status: 'draft' })
    assert.deepEqual(state.sort, { createdAt: -1, _id: -1 })
    assert.deepEqual(state.deleted, [existingService.id])

    const missing = createServiceHarness().service
    await assert.rejects(missing.getService(serviceId), (error) => error.status === 404)
    await assert.rejects(missing.updateService(serviceId, { title: 'Missing' }), (error) => error.status === 404)
    await assert.rejects(missing.deleteService(serviceId), (error) => error.status === 404)
  })
})
