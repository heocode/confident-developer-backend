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

function ownerNotificationData(overrides = {}) {
  return {
    id: '68f120000000000000000002',
    kind: 'contact-owner-notification',
    sourceId: inquiryId,
    status: 'pending',
    attemptCount: 0,
    nextAttemptAt: new Date('2026-10-15T13:00:00.000Z'),
    lastAttemptAt: null,
    leaseUntil: null,
    acceptedAt: null,
    failedAt: null,
    lastFailureCode: null,
    providerMessageId: 'private-provider-message-id',
    ...overrides,
  }
}

function inquiryView(inquiryOverrides = {}, notification = ownerNotificationData()) {
  return { inquiry: inquiryData(inquiryOverrides), ownerNotification: notification, replies: [] }
}

function replyView() {
  return {
    reply: {
      id: '68f120000000000000000003',
      inquiryId,
      message: 'Thank you for reaching out.',
      commandFingerprint: 'private-command-fingerprint',
      createdAt: new Date('2026-10-15T14:00:00.000Z'),
    },
    delivery: {
      id: '68f120000000000000000004',
      sourceId: '68f120000000000000000003',
      status: 'pending',
      attemptCount: 0,
    },
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
        items: [inquiryView()],
        pagination: { page: query.page, limit: query.limit, totalItems: 1, totalPages: 1 },
      }
    },
    async getAdminInquiry(id) {
      calls.get.push(id)
      return inquiryView()
    },
    async markInquiryRead(id) {
      calls.status.push({ id, action: 'read' })
      return inquiryView({ status: 'read', readAt: new Date('2026-10-15T14:00:00.000Z') })
    },
    async archiveInquiry(id) {
      calls.status.push({ id, action: 'archive' })
      return inquiryView({
        status: 'archived',
        archivedAt: new Date('2026-10-15T14:00:00.000Z'),
      })
    },
    async restoreInquiry(id) {
      calls.status.push({ id, action: 'restore' })
      return inquiryView()
    },
    async deleteArchivedInquiry(id) {
      calls.delete.push(id)
    },
    async queueAdminReply(id, body, idempotencyKey) {
      calls.reply.push({ id, body, idempotencyKey })
      return replyView()
    },
    async retryOwnerNotification(id, idempotencyKey) {
      calls.retry.push({ kind: 'owner', id, idempotencyKey })
      return ownerNotificationData({ status: 'pending', manualRetryCount: 1 })
    },
    async retryAdminReply(id, replyId, idempotencyKey) {
      calls.retry.push({ kind: 'reply', id, replyId, idempotencyKey })
      return replyView().delivery
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
    calls = { list: [], get: [], status: [], delete: [], reply: [], retry: [] }
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
    assert.deepEqual(body.data.items[0].ownerNotification, {
      status: 'pending',
      attemptCount: 0,
    })
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
    assert.deepEqual(body.data.ownerNotification, {
      status: 'pending',
      attemptCount: 0,
      recipientStatus: 'unknown',
      manualRetryCount: 0,
      lastAttemptAt: null,
      lastManualRetryAt: null,
      acceptedAt: null,
      delayedAt: null,
      deliveredAt: null,
      bouncedAt: null,
      complainedAt: null,
      failedAt: null,
      lastFailureCode: null,
    })
    assert.equal('submissionFingerprint' in body.data, false)
    assert.equal('sourceId' in body.data.ownerNotification, false)
    assert.equal('leaseUntil' in body.data.ownerNotification, false)
    assert.equal('providerMessageId' in body.data.ownerNotification, false)
    assert.equal('id' in body.data.ownerNotification, false)
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

  it('queues an idempotent reply without exposing delivery internals', async () => {
    const idempotencyKey = 'e9a18202-ec50-4d3d-8cd6-455fde7d20b4'
    const { response, body } = await requestJson(
      baseUrl,
      `/api/v1/admin/inquiries/${inquiryId}/replies`,
      {
        method: 'POST',
        headers: {
          ...adminHeaders({ origin: true, json: true }),
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({ message: '  Thank you for reaching out.  ' }),
      },
    )

    assert.equal(response.status, 201)
    assert.equal(body.data.message, 'Thank you for reaching out.')
    assert.deepEqual(body.data.delivery, {
      status: 'pending',
      attemptCount: 0,
      recipientStatus: 'unknown',
      manualRetryCount: 0,
      lastAttemptAt: null,
      lastManualRetryAt: null,
      acceptedAt: null,
      delayedAt: null,
      deliveredAt: null,
      bouncedAt: null,
      complainedAt: null,
      failedAt: null,
      lastFailureCode: null,
    })
    assert.equal('commandFingerprint' in body.data, false)
    assert.equal('sourceId' in body.data.delivery, false)
    assert.deepEqual(calls.reply, [
      {
        id: inquiryId,
        body: { message: 'Thank you for reaching out.' },
        idempotencyKey,
      },
    ])
  })

  it('requires a UUID idempotency key and strict reply body', async () => {
    for (const request of [
      { headers: {}, body: { message: 'Reply' } },
      { headers: { 'idempotency-key': 'invalid' }, body: { message: 'Reply' } },
      {
        headers: { 'idempotency-key': 'e9a18202-ec50-4d3d-8cd6-455fde7d20b4' },
        body: { message: 'Reply', subject: 'Client-owned' },
      },
    ]) {
      const result = await requestJson(
        baseUrl,
        `/api/v1/admin/inquiries/${inquiryId}/replies`,
        {
          method: 'POST',
          headers: { ...adminHeaders({ origin: true, json: true }), ...request.headers },
          body: JSON.stringify(request.body),
        },
      )
      assert.equal(result.response.status, 400)
    }
    assert.equal(calls.reply.length, 0)
  })

  it('retries failed notification and reply deliveries through idempotent commands', async () => {
    const idempotencyKey = '4cb756b9-4a95-4264-a843-d687b29b1e92'
    const paths = [
      `/api/v1/admin/inquiries/${inquiryId}/owner-notification/retry`,
      `/api/v1/admin/inquiries/${inquiryId}/replies/68f120000000000000000003/retry`,
    ]

    for (const path of paths) {
      const { response, body } = await requestJson(baseUrl, path, {
        method: 'POST',
        headers: {
          ...adminHeaders({ origin: true }),
          'idempotency-key': idempotencyKey,
        },
      })
      assert.equal(response.status, 200)
      assert.equal(body.data.status, 'pending')
      assert.equal('providerMessageId' in body.data, false)
    }

    assert.deepEqual(calls.retry, [
      { kind: 'owner', id: inquiryId, idempotencyKey },
      {
        kind: 'reply',
        id: inquiryId,
        replyId: '68f120000000000000000003',
        idempotencyKey,
      },
    ])
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
