import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import createError from 'http-errors'
import mongoose from 'mongoose'

import { createApp } from '../../../src/app.js'
import { loadEnvironment } from '../../../src/config/environment.js'

const frontendOrigin = 'http://localhost:5173'
const sessionCookie = 'cd_admin_session=profile-session-token'
const postId = new mongoose.Types.ObjectId('68f000000000000000000001')

function profilePost(overrides = {}) {
  return {
    _id: postId,
    key: 'home',
    text: 'Shipping thoughtful digital products.',
    revision: 3,
    contentUpdatedAt: new Date('2026-10-14T12:00:00.000Z'),
    likeCount: 7,
    viewCount: 42,
    createdAt: new Date('2026-10-10T12:00:00.000Z'),
    updatedAt: new Date('2026-10-14T12:00:00.000Z'),
    ...overrides,
  }
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const body = await response.json()
  return { response, body }
}

describe('profile post HTTP contract', () => {
  let baseUrl
  let server
  let calls

  const authService = {
    async getAdminForToken(token) {
      if (token !== 'profile-session-token') throw createError(401, 'Authentication required')
      return { id: 'admin-id', displayName: 'Owner', email: 'owner@example.com' }
    },
  }

  const profilePostService = {
    async getPost() {
      calls.get += 1
      if (calls.missing) throw createError(404, 'Profile post not found')
      return profilePost()
    },
    async replacePost(input) {
      calls.replace.push(input)
      return { post: profilePost({ text: input.text, revision: 4 }), created: false, changed: true }
    },
    async getInteraction(input) {
      calls.interaction.push(input)
      return { post: profilePost(), liked: false }
    },
    async like(input) {
      calls.like.push(input)
      return { post: profilePost({ likeCount: 8 }), changed: true, liked: true }
    },
    async unlike(input) {
      calls.unlike.push(input)
      return { post: profilePost({ likeCount: 6 }), changed: true, liked: false }
    },
    async recordView(input) {
      calls.view.push(input)
      return { post: profilePost({ viewCount: 43 }), changed: true, recorded: true }
    },
  }

  before(async () => {
    const environment = loadEnvironment({ NODE_ENV: 'test', CLIENT_ORIGINS: frontendOrigin })
    const app = createApp({
      environment,
      authService,
      profilePostService,
      profileLikeRateLimitOptions: { limit: 1_000 },
      profileViewRateLimitOptions: { limit: 1_000 },
    })

    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1')
      server.once('listening', resolve)
      server.once('error', reject)
    })
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  beforeEach(() => {
    calls = { get: 0, missing: false, replace: [], interaction: [], like: [], unlike: [], view: [] }
  })

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('returns the current public post through an explicit short-cache serializer', async () => {
    const { response, body } = await requestJson(baseUrl, '/api/v1/profile-post')

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'public, max-age=0, s-maxage=15, stale-while-revalidate=30')
    assert.equal(response.headers.get('cdn-cache-control'), 'max-age=15, stale-while-revalidate=30')
    assert.deepEqual(body.data, {
      id: postId.toString(),
      text: 'Shipping thoughtful digital products.',
      revision: 3,
      contentUpdatedAt: '2026-10-14T12:00:00.000Z',
      likes: 7,
      views: 42,
    })
    assert.equal('key' in body.data, false)
  })

  it('does not cache validation or missing-post errors', async () => {
    const invalid = await requestJson(baseUrl, '/api/v1/profile-post?preview=true')
    assert.equal(invalid.response.status, 400)
    assert.equal(invalid.response.headers.get('cache-control'), null)

    calls.missing = true
    const missing = await requestJson(baseUrl, '/api/v1/profile-post')
    assert.equal(missing.response.status, 404)
    assert.equal(missing.response.headers.get('cache-control'), null)
  })

  it('returns personalized interaction state without creating a visitor cookie', async () => {
    const { response, body } = await requestJson(
      baseUrl,
      '/api/v1/profile-post/interaction?revision=3',
    )

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(response.headers.get('set-cookie'), null)
    assert.deepEqual(body.data, { revision: 3, likes: 7, liked: false })
    assert.deepEqual(calls.interaction.at(-1), { revision: 3, visitorHash: null })
  })

  it('requires a trusted origin, creates an opaque visitor cookie, and never exposes its hash', async () => {
    const blocked = await requestJson(baseUrl, '/api/v1/profile-post/like', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ revision: 3 }),
    })
    assert.equal(blocked.response.status, 403)

    const liked = await requestJson(baseUrl, '/api/v1/profile-post/like', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: frontendOrigin },
      body: JSON.stringify({ revision: 3 }),
    })

    assert.equal(liked.response.status, 200)
    assert.equal(liked.response.headers.get('cache-control'), 'private, no-store')
    assert.match(liked.response.headers.get('set-cookie'), /^cd_visitor=[A-Za-z0-9_-]{43};/)
    assert.match(liked.response.headers.get('set-cookie'), /HttpOnly/)
    assert.equal(calls.like.at(-1).visitorHash.length, 64)
    assert.equal(JSON.stringify(liked.body).includes(calls.like.at(-1).visitorHash), false)
    assert.deepEqual(liked.body.data, { revision: 3, likes: 8, liked: true })
  })

  it('uses the existing visitor identity for unlike and view operations', async () => {
    const visitorCookie = `cd_visitor=${'a'.repeat(43)}`
    const headers = {
      cookie: visitorCookie,
      'content-type': 'application/json',
      origin: frontendOrigin,
    }
    const unlike = await requestJson(baseUrl, '/api/v1/profile-post/like', {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ revision: 3 }),
    })
    const view = await requestJson(baseUrl, '/api/v1/profile-post/view', {
      method: 'POST',
      headers,
      body: JSON.stringify({ revision: 3 }),
    })

    assert.equal(unlike.response.status, 200)
    assert.deepEqual(unlike.body.data, { revision: 3, likes: 6, liked: false })
    assert.equal(view.response.status, 200)
    assert.deepEqual(view.body.data, { revision: 3, views: 43, recorded: true })
    assert.equal(calls.unlike.at(-1).visitorHash, calls.view.at(-1).visitorHash)
  })

  it('protects admin reads and validates authenticated replacement writes', async () => {
    const unauthenticated = await requestJson(baseUrl, '/api/v1/admin/profile-post')
    assert.equal(unauthenticated.response.status, 401)

    const adminGet = await requestJson(baseUrl, '/api/v1/admin/profile-post', {
      headers: { cookie: sessionCookie },
    })
    assert.equal(adminGet.response.status, 200)
    assert.equal(adminGet.response.headers.get('cache-control'), 'private, no-store')
    assert.equal(adminGet.body.data.createdAt, '2026-10-10T12:00:00.000Z')

    const missingOrigin = await requestJson(baseUrl, '/api/v1/admin/profile-post', {
      method: 'PUT',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'New post' }),
    })
    assert.equal(missingOrigin.response.status, 403)

    const invalid = await requestJson(baseUrl, '/api/v1/admin/profile-post', {
      method: 'PUT',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
        origin: frontendOrigin,
      },
      body: JSON.stringify({ text: 'New post', likes: 999 }),
    })
    assert.equal(invalid.response.status, 400)

    const replaced = await requestJson(baseUrl, '/api/v1/admin/profile-post', {
      method: 'PUT',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
        origin: frontendOrigin,
      },
      body: JSON.stringify({ text: ' New post ' }),
    })
    assert.equal(replaced.response.status, 200)
    assert.equal(replaced.response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(calls.replace.at(-1), { text: 'New post' })
    assert.equal(replaced.body.data.revision, 4)
  })
})
