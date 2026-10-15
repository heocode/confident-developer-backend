import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import { createApp } from '../../../src/app.js'
import { loadEnvironment } from '../../../src/config/environment.js'

const frontendOrigin = 'http://localhost:5173'
const sessionCookie = 'cd_admin_session=contact-session-token'
const inquiryId = '68f120000000000000000001'

function inquiryData(overrides = {}) {
  return {
    id: inquiryId,
    name: 'Jordan Smith',
    email: 'jordan@example.com',
    message: 'I would like to discuss a portfolio application.',
    scopes: ['website-web-app', 'backend-api'],
    budget: '2500-5000',
    status: 'new',
    readAt: null,
    repliedAt: null,
    archivedAt: null,
    submissionFingerprint: 'a'.repeat(64),
    createdAt: new Date('2026-10-15T13:00:00.000Z'),
    updatedAt: new Date('2026-10-15T13:00:00.000Z'),
    ...overrides,
  }
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const body = await response.json()
  return { response, body }
}

function adminHeaders({ origin = false, json = false } = {}) {
  return {
    cookie: sessionCookie,
    ...(origin ? { origin: frontendOrigin } : {}),
    ...(json ? { 'content-type': 'application/json' } : {}),
  }
}

describe('admin contact inbox HTTP contract', () => {
  let baseUrl
  let server
  let calls

  const authService = {
    async getAdminForToken(token) {
      if (token !== 'contact-session-token') {
        throw Object.assign(new Error('Authentication required'), { status: 401 })
      }

      return { id: 'admin-id', displayName: 'Owner', email: 'owner@example.com' }
    },
  }

  const contactService = {
    async submitInquiry() {},
    async listAdminInquiries(query) {
      calls.list.push(query)
      return {
        items: [inquiryData()],
        pagination: { page: query.page, limit: query.limit, totalItems: 1, totalPages: 1 },
      }
    },
    async getAdminInquiry(id) {
      calls.get.push(id)
      return inquiryData()
    },
    async markInquiryRead(id) {
      calls.status.push({ id, action: 'read' })
      return inquiryData({ status: 'read', readAt: new Date('2026-10-15T14:00:00.000Z') })
    },
    async archiveInquiry(id) {
      calls.status.push({ id, action: 'archive' })
      return inquiryData({
        status: 'archived',
        archivedAt: new Date('2026-10-15T14:00:00.000Z'),
      })
    },
    async restoreInquiry(id) {
      calls.status.push({ id, action: 'restore' })
      return inquiryData()
    },
    async deleteArchivedInquiry(id) {
      calls.delete.push(id)
    },
  }

  before(async () => {
    const environment = loadEnvironment({ NODE_ENV: 'test', CLIENT_ORIGINS: frontendOrigin })
    const app = createApp({ environment, authService, contactService })

    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1')
      server.once('listening', resolve)
      server.once('error', reject)
    })
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  beforeEach(() => {
    calls = { list: [], get: [], status: [], delete: [] }
  })

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('requires an authenticated admin and a trusted origin for mutations', async () => {
    const unauthenticated = await requestJson(baseUrl, '/api/v1/admin/inquiries')
    assert.equal(unauthenticated.response.status, 401)

    const missingOrigin = await requestJson(
      baseUrl,
      `/api/v1/admin/inquiries/${inquiryId}/status`,
      {
        method: 'PATCH',
        headers: adminHeaders({ json: true }),
        body: JSON.stringify({ action: 'read' }),
      },
    )
    assert.equal(missingOrigin.response.status, 403)
    assert.equal(calls.status.length, 0)
  })

  it('lists filtered inquiries without exposing messages or persistence internals', async () => {
    const { response, body } = await requestJson(
      baseUrl,
      '/api/v1/admin/inquiries?page=2&limit=10&status=new',
      { headers: adminHeaders() },
    )

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(calls.list, [{ page: 2, limit: 10, status: 'new' }])
    assert.deepEqual(body.data.pagination, {
      page: 2,
      limit: 10,
      totalItems: 1,
      totalPages: 1,
    })
    assert.equal(body.data.items[0].email, 'jordan@example.com')
    assert.equal('message' in body.data.items[0], false)
    assert.equal('submissionFingerprint' in body.data.items[0], false)
    assert.equal('_id' in body.data.items[0], false)
  })

  it('retrieves the complete private inquiry through an explicit admin representation', async () => {
    const { response, body } = await requestJson(
      baseUrl,
      `/api/v1/admin/inquiries/${inquiryId}`,
      { headers: adminHeaders() },
    )

    assert.equal(response.status, 200)
    assert.equal(body.data.id, inquiryId)
    assert.equal(body.data.message, 'I would like to discuss a portfolio application.')
    assert.equal(body.data.createdAt, '2026-10-15T13:00:00.000Z')
    assert.equal('submissionFingerprint' in body.data, false)
    assert.deepEqual(calls.get, [inquiryId])
  })

  it('dispatches only allowlisted lifecycle actions', async () => {
    for (const action of ['read', 'archive', 'restore']) {
      const result = await requestJson(
        baseUrl,
        `/api/v1/admin/inquiries/${inquiryId}/status`,
        {
          method: 'PATCH',
          headers: adminHeaders({ origin: true, json: true }),
          body: JSON.stringify({ action }),
        },
      )
      assert.equal(result.response.status, 200)
      assert.equal(result.response.headers.get('cache-control'), 'private, no-store')
    }

    assert.deepEqual(calls.status, [
      { id: inquiryId, action: 'read' },
      { id: inquiryId, action: 'archive' },
      { id: inquiryId, action: 'restore' },
    ])

    for (const body of [{ action: 'replied' }, { action: 'read', status: 'read' }, {}]) {
      const result = await requestJson(
        baseUrl,
        `/api/v1/admin/inquiries/${inquiryId}/status`,
        {
          method: 'PATCH',
          headers: adminHeaders({ origin: true, json: true }),
          body: JSON.stringify(body),
        },
      )
      assert.equal(result.response.status, 400)
    }
    assert.equal(calls.status.length, 3)
  })

  it('deletes through the archived-only service operation', async () => {
    const { response, body } = await requestJson(
      baseUrl,
      `/api/v1/admin/inquiries/${inquiryId}`,
      { method: 'DELETE', headers: adminHeaders({ origin: true }) },
    )

    assert.equal(response.status, 200)
    assert.deepEqual(body, {
      success: true,
      message: 'Contact inquiry deleted successfully.',
    })
    assert.deepEqual(calls.delete, [inquiryId])
  })

  it('rejects malformed IDs, invalid pagination, and unknown query parameters', async () => {
    for (const path of [
      '/api/v1/admin/inquiries/not-an-id',
      '/api/v1/admin/inquiries?page=0',
      '/api/v1/admin/inquiries?limit=101',
      '/api/v1/admin/inquiries?status=unknown',
      '/api/v1/admin/inquiries?search=Jordan',
      `/api/v1/admin/inquiries/${inquiryId}?unexpected=true`,
    ]) {
      const result = await requestJson(baseUrl, path, { headers: adminHeaders() })
      assert.equal(result.response.status, 400)
      assert.equal(result.response.headers.get('cache-control'), 'private, no-store')
    }
  })
})
