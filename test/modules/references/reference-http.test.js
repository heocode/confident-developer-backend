import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import mongoose from 'mongoose'

import { createApp } from '../../../src/app.js'
import { loadEnvironment } from '../../../src/config/environment.js'

const frontendOrigin = 'http://localhost:5173'
const sessionCookie = 'cd_admin_session=reference-session-token'
const referenceId = '68e7c0000000000000000001'
const adminId = '68e7c0000000000000000002'

function referenceData(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(referenceId),
    name: 'James Smith',
    normalizedEmail: 'james@example.com',
    company: 'SuperSauced',
    position: 'Founder',
    originalTestimonial: 'Vadim turns ideas into reliable products.',
    testimonial: 'Vadim turns ideas into reliable products.',
    ratings: { overall: 5, technical: 5, communication: 5 },
    status: 'approved',
    displayOrder: 1,
    moderation: {
      moderatedBy: new mongoose.Types.ObjectId(adminId),
      moderatedAt: new Date('2026-10-14T12:00:00.000Z'),
    },
    approvedAt: new Date('2026-10-14T12:00:00.000Z'),
    createdAt: new Date('2026-10-13T12:00:00.000Z'),
    updatedAt: new Date('2026-10-14T12:00:00.000Z'),
    ...overrides,
  }
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const body = await response.json()
  return { response, body }
}

describe('Reference HTTP contracts', () => {
  let baseUrl
  let server
  let calls

  const authService = {
    async getAdminForToken(token) {
      if (token !== 'reference-session-token') {
        const error = new Error('Authentication required')
        error.status = 401
        throw error
      }

      return { id: adminId, displayName: 'Owner', email: 'owner@example.com' }
    },
  }

  const referenceService = {
    async listPublicReferences(query) {
      calls.publicList.push(query)
      return {
        items: [referenceData()],
        pagination: { page: query.page, limit: query.limit, totalItems: 1, totalPages: 1 },
      }
    },
    async listAdminReferences(query) {
      calls.adminList.push(query)
      return {
        items: [referenceData()],
        pagination: { page: query.page, limit: query.limit, totalItems: 1, totalPages: 1 },
      }
    },
    async getAdminReference(id) {
      calls.get.push(id)
      return referenceData()
    },
    async updateReference(id, input) {
      calls.update.push({ id, input })
      return referenceData({ ...input, editedAt: new Date('2026-10-15T12:00:00.000Z') })
    },
    async moderateReference(id, input, ownerId) {
      calls.moderate.push({ id, input, ownerId })
      return referenceData({ status: input.action === 'reject' ? 'rejected' : 'approved' })
    },
    async deleteReference(id) {
      calls.delete.push(id)
    },
  }

  before(async () => {
    const environment = loadEnvironment({ NODE_ENV: 'test', CLIENT_ORIGINS: frontendOrigin })
    const app = createApp({ environment, authService, referenceService })

    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1')
      server.once('listening', resolve)
      server.once('error', reject)
    })

    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  beforeEach(() => {
    calls = { publicList: [], adminList: [], get: [], update: [], moderate: [], delete: [] }
  })

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('returns a paginated allowlisted public list with a short cache lifetime', async () => {
    const { response, body } = await requestJson(baseUrl, '/api/v1/references?page=2&limit=5')

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'public, max-age=0, s-maxage=30')
    assert.equal(response.headers.get('cdn-cache-control'), 'max-age=30')
    assert.deepEqual(calls.publicList.at(-1), { page: 2, limit: 5 })
    assert.deepEqual(body.data.items[0], {
      id: referenceId,
      name: 'James Smith',
      company: 'SuperSauced',
      position: 'Founder',
      testimonial: 'Vadim turns ideas into reliable products.',
      ratings: { overall: 5, technical: 5, communication: 5 },
      publishedAt: '2026-10-14T12:00:00.000Z',
    })
    assert.equal('email' in body.data.items[0], false)
    assert.equal('status' in body.data.items[0], false)
  })

  it('rejects unknown and invalid public pagination without caching errors', async () => {
    for (const path of ['/api/v1/references?unexpected=true', '/api/v1/references?page=0']) {
      const result = await requestJson(baseUrl, path)
      assert.equal(result.response.status, 400)
      assert.equal(result.response.headers.get('cache-control'), null)
    }
  })

  it('protects the admin list and returns private moderation data', async () => {
    const unauthorized = await requestJson(baseUrl, '/api/v1/admin/references')
    assert.equal(unauthorized.response.status, 401)

    const { response, body } = await requestJson(
      baseUrl,
      '/api/v1/admin/references?status=approved&page=1&limit=20',
      { headers: { cookie: sessionCookie } },
    )

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(calls.adminList.at(-1), { status: 'approved', page: 1, limit: 20 })
    assert.equal(body.data.items[0].email, 'james@example.com')
    assert.equal(body.data.items[0].originalTestimonial, 'Vadim turns ideas into reliable products.')
    assert.equal('managementTokenHash' in body.data.items[0], false)
  })

  it('edits, moderates, retrieves, and deletes through protected routes', async () => {
    const get = await requestJson(baseUrl, `/api/v1/admin/references/${referenceId}`, {
      headers: { cookie: sessionCookie },
    })
    assert.equal(get.response.status, 200)
    assert.equal(calls.get.at(-1), referenceId)

    const update = await requestJson(baseUrl, `/api/v1/admin/references/${referenceId}`, {
      method: 'PATCH',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
        origin: frontendOrigin,
      },
      body: JSON.stringify({ testimonial: 'A carefully corrected testimonial for publication.' }),
    })
    assert.equal(update.response.status, 200)
    assert.deepEqual(calls.update.at(-1), {
      id: referenceId,
      input: { testimonial: 'A carefully corrected testimonial for publication.' },
    })

    const moderation = await requestJson(
      baseUrl,
      `/api/v1/admin/references/${referenceId}/moderation`,
      {
        method: 'PATCH',
        headers: {
          cookie: sessionCookie,
          'content-type': 'application/json',
          origin: frontendOrigin,
        },
        body: JSON.stringify({ action: 'reject', reason: 'spam', note: 'Repeated promotion' }),
      },
    )
    assert.equal(moderation.response.status, 200)
    assert.deepEqual(calls.moderate.at(-1), {
      id: referenceId,
      input: { action: 'reject', reason: 'spam', note: 'Repeated promotion' },
      ownerId: adminId,
    })

    const deletion = await requestJson(baseUrl, `/api/v1/admin/references/${referenceId}`, {
      method: 'DELETE',
      headers: { cookie: sessionCookie, origin: frontendOrigin },
    })
    assert.equal(deletion.response.status, 200)
    assert.equal(calls.delete.at(-1), referenceId)
  })

  it('rejects malformed IDs, empty edits, invalid transitions, and untrusted writes', async () => {
    const malformed = await requestJson(baseUrl, '/api/v1/admin/references/not-an-id', {
      headers: { cookie: sessionCookie },
    })
    assert.equal(malformed.response.status, 400)

    const missingOrigin = await requestJson(baseUrl, `/api/v1/admin/references/${referenceId}`, {
      method: 'PATCH',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ displayOrder: 2 }),
    })
    assert.equal(missingOrigin.response.status, 403)

    for (const body of [
      {},
      { status: 'approved' },
      { testimonial: { $ne: null } },
      { displayOrder: -1 },
    ]) {
      const result = await requestJson(baseUrl, `/api/v1/admin/references/${referenceId}`, {
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

    const missingOtherNote = await requestJson(
      baseUrl,
      `/api/v1/admin/references/${referenceId}/moderation`,
      {
        method: 'PATCH',
        headers: {
          cookie: sessionCookie,
          'content-type': 'application/json',
          origin: frontendOrigin,
        },
        body: JSON.stringify({ action: 'reject', reason: 'other' }),
      },
    )
    assert.equal(missingOtherNote.response.status, 400)
  })
})
