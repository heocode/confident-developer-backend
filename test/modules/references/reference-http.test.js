import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import mongoose from 'mongoose'

import { createApp } from '../../../src/app.js'
import { loadEnvironment } from '../../../src/config/environment.js'

const frontendOrigin = 'http://localhost:5173'
const sessionCookie = 'cd_admin_session=reference-session-token'
const referenceId = '68e7c0000000000000000001'
const adminId = '68e7c0000000000000000002'
const managementToken = 'm'.repeat(43)

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

function settingsData(overrides = {}) {
  return {
    key: 'home',
    emptyStateMessage: 'It feels empty, but that is only for now!',
    messageUpdatedAt: new Date('2026-10-15T12:00:00.000Z'),
    ...overrides,
  }
}

function emptyStateData() {
  return {
    settings: settingsData(),
    identity: {
      profile: {
        publicIdentity: { displayName: 'Vadim Iskakov', handle: 'heoposit' },
      },
      asset: { alt: 'Vadim Iskakov' },
      avatarUrl: 'https://res.cloudinary.com/example/image/upload/avatar.webp',
    },
  }
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const body = await response.json()
  return { response, body }
}

function submissionBody(overrides = {}) {
  return {
    name: '  James   Smith  ',
    email: 'JAMES@EXAMPLE.COM',
    company: '  SuperSauced ',
    position: ' Founder ',
    testimonial: '  Vadim turns ideas into reliable products.  ',
    ratings: { overall: 5, technical: 5, communication: 5 },
    turnstileToken: 'verified-turnstile-token',
    website: '',
    ...overrides,
  }
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
    async submitReference(input, context) {
      calls.submit.push({ input, context })
      return {
        reference: referenceData({
          ...input,
          normalizedEmail: input.email,
          originalTestimonial: input.testimonial,
          status: 'pending',
          approvedAt: undefined,
        }),
        managementToken,
      }
    },
    async getOwnedReference(id, token) {
      calls.ownedGet.push({ id, token })
      return referenceData({ status: 'pending', approvedAt: undefined })
    },
    async deleteOwnedReference(id, token) {
      calls.ownedDelete.push({ id, token })
    },
    async listPublicReferences(query) {
      calls.publicList.push(query)
      return {
        items: [referenceData()],
        emptyState: null,
        pagination: { page: query.page, limit: query.limit, totalItems: 1, totalPages: 1 },
      }
    },
    async getReferenceSettings() {
      calls.settingsGet += 1
      return settingsData()
    },
    async updateReferenceSettings(input) {
      calls.settingsUpdate.push(input)
      return { settings: settingsData(input), created: false, changed: true }
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
    const app = createApp({
      environment,
      authService,
      referenceService,
      referenceSubmissionRateLimitOptions: { limit: 100, windowMs: 60_000 },
    })

    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1')
      server.once('listening', resolve)
      server.once('error', reject)
    })

    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  beforeEach(() => {
    calls = {
      submit: [],
      ownedGet: [],
      ownedDelete: [],
      publicList: [],
      settingsGet: 0,
      settingsUpdate: [],
      adminList: [],
      get: [],
      update: [],
      moderate: [],
      delete: [],
    }
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
    assert.equal(body.data.emptyState, null)
  })

  it('returns a fully serialized empty state when no approved references exist', async () => {
    const originalList = referenceService.listPublicReferences
    referenceService.listPublicReferences = async (query) => ({
      items: [],
      emptyState: emptyStateData(),
      pagination: { page: query.page, limit: query.limit, totalItems: 0, totalPages: 0 },
    })

    try {
      const { response, body } = await requestJson(baseUrl, '/api/v1/references')
      assert.equal(response.status, 200)
      assert.deepEqual(body.data.emptyState, {
        author: {
          displayName: 'Vadim Iskakov',
          handle: 'heoposit',
          avatar: {
            url: 'https://res.cloudinary.com/example/image/upload/avatar.webp',
            alt: 'Vadim Iskakov',
          },
        },
        message: 'It feels empty, but that is only for now!',
        updatedAt: '2026-10-15T12:00:00.000Z',
      })
      assert.deepEqual(body.data.items, [])
    } finally {
      referenceService.listPublicReferences = originalList
    }
  })

  it('normalizes and submits a private pending reference through a trusted origin', async () => {
    const { response, body } = await requestJson(baseUrl, '/api/v1/references', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: frontendOrigin },
      body: JSON.stringify(submissionBody()),
    })

    assert.equal(response.status, 201)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(body.message, 'Your reference was submitted for review.')
    assert.equal(body.data.managementToken, managementToken)
    assert.equal(body.data.reference.status, 'pending')
    assert.equal(body.data.reference.name, 'James Smith')
    assert.equal(body.data.reference.company, 'SuperSauced')
    assert.equal(body.data.reference.approvedAt, null)
    assert.equal('email' in body.data.reference, false)
    assert.equal('originalTestimonial' in body.data.reference, false)
    assert.equal('managementTokenHash' in body.data.reference, false)
    assert.deepEqual(calls.submit.at(-1).input, {
      name: 'James Smith',
      email: 'james@example.com',
      company: 'SuperSauced',
      position: 'Founder',
      testimonial: 'Vadim turns ideas into reliable products.',
      ratings: { overall: 5, technical: 5, communication: 5 },
      turnstileToken: 'verified-turnstile-token',
      website: '',
    })
    assert.equal(typeof calls.submit.at(-1).context.remoteIp, 'string')
  })

  it('returns private ownership state and deletes it only through the management header', async () => {
    const ownershipHeaders = { 'x-reference-management-token': managementToken }
    const get = await requestJson(baseUrl, `/api/v1/references/submissions/${referenceId}`, {
      headers: ownershipHeaders,
    })

    assert.equal(get.response.status, 200)
    assert.equal(get.response.headers.get('cache-control'), 'private, no-store')
    assert.equal(get.body.data.status, 'pending')
    assert.equal('email' in get.body.data, false)
    assert.deepEqual(calls.ownedGet.at(-1), { id: referenceId, token: managementToken })

    const deletion = await requestJson(baseUrl, `/api/v1/references/${referenceId}/submission`, {
      method: 'DELETE',
      headers: { ...ownershipHeaders, origin: frontendOrigin },
    })
    assert.equal(deletion.response.status, 200)
    assert.equal(deletion.response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(calls.ownedDelete.at(-1), { id: referenceId, token: managementToken })
  })

  it('requires a trusted origin and rejects unsafe or client-controlled submission fields', async () => {
    const missingOrigin = await requestJson(baseUrl, '/api/v1/references', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(submissionBody()),
    })
    assert.equal(missingOrigin.response.status, 403)

    for (const body of [
      submissionBody({ status: 'approved' }),
      submissionBody({ name: { $ne: null } }),
      submissionBody({ testimonial: 'Read more at https://spam.example right now.' }),
      submissionBody({ website: 'bot-filled.example' }),
      submissionBody({ ratings: { overall: 0, technical: 5, communication: 5 } }),
    ]) {
      const result = await requestJson(baseUrl, '/api/v1/references', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: frontendOrigin },
        body: JSON.stringify(body),
      })
      assert.equal(result.response.status, 400)
      assert.equal(result.response.headers.get('cache-control'), 'private, no-store')
    }
  })

  it('validates ownership IDs and requires a trusted origin for deletion', async () => {
    const malformed = await requestJson(baseUrl, '/api/v1/references/submissions/not-an-id', {
      headers: { 'x-reference-management-token': managementToken },
    })
    assert.equal(malformed.response.status, 400)

    const unknownQuery = await requestJson(
      baseUrl,
      `/api/v1/references/submissions/${referenceId}?unexpected=true`,
      { headers: { 'x-reference-management-token': managementToken } },
    )
    assert.equal(unknownQuery.response.status, 400)

    const deletion = await requestJson(baseUrl, `/api/v1/references/${referenceId}/submission`, {
      method: 'DELETE',
      headers: { 'x-reference-management-token': managementToken },
    })
    assert.equal(deletion.response.status, 403)

    const unknownSubmitQuery = await requestJson(baseUrl, '/api/v1/references?unexpected=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: frontendOrigin },
      body: JSON.stringify(submissionBody()),
    })
    assert.equal(unknownSubmitQuery.response.status, 400)
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

  it('retrieves and updates strict reference section settings through the admin API', async () => {
    const get = await requestJson(baseUrl, '/api/v1/admin/references/settings', {
      headers: { cookie: sessionCookie },
    })
    assert.equal(get.response.status, 200)
    assert.equal(get.body.data.emptyStateMessage, 'It feels empty, but that is only for now!')
    assert.equal(calls.settingsGet, 1)

    const update = await requestJson(baseUrl, '/api/v1/admin/references/settings', {
      method: 'PUT',
      headers: {
        cookie: sessionCookie,
        origin: frontendOrigin,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ emptyStateMessage: '  A new conversation starts here.  ' }),
    })
    assert.equal(update.response.status, 200)
    assert.equal(update.response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(calls.settingsUpdate.at(-1), {
      emptyStateMessage: 'A new conversation starts here.',
    })

    const invalid = await requestJson(baseUrl, '/api/v1/admin/references/settings', {
      method: 'PUT',
      headers: {
        cookie: sessionCookie,
        origin: frontendOrigin,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ emptyStateMessage: 'Message', status: 'published' }),
    })
    assert.equal(invalid.response.status, 400)
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

describe('Reference submission rate limit', () => {
  it('applies a dedicated limiter without affecting public reads', async () => {
    const environment = loadEnvironment({ NODE_ENV: 'test', CLIENT_ORIGINS: frontendOrigin })
    const referenceService = {
      async submitReference(input) {
        return {
          reference: referenceData({
            ...input,
            status: 'pending',
            approvedAt: undefined,
          }),
          managementToken,
        }
      },
      async listPublicReferences(query) {
        return {
          items: [],
          pagination: { page: query.page, limit: query.limit, totalItems: 0, totalPages: 0 },
        }
      },
    }
    const app = createApp({
      environment,
      referenceService,
      referenceSubmissionRateLimitOptions: { limit: 1, windowMs: 60_000 },
    })
    let server

    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1')
      server.once('listening', resolve)
      server.once('error', reject)
    })

    try {
      const localBaseUrl = `http://127.0.0.1:${server.address().port}`
      const options = {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: frontendOrigin },
        body: JSON.stringify(submissionBody()),
      }
      assert.equal((await requestJson(localBaseUrl, '/api/v1/references', options)).response.status, 201)
      const limited = await requestJson(localBaseUrl, '/api/v1/references', options)
      assert.equal(limited.response.status, 429)
      assert.equal(limited.body.message, 'Too many reference submissions. Please try again later.')
      assert.equal((await requestJson(localBaseUrl, '/api/v1/references')).response.status, 200)
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })
})
