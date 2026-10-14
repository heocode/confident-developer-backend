import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import createError from 'http-errors'

import { createApp } from '../../../src/app.js'
import { loadEnvironment } from '../../../src/config/environment.js'

const frontendOrigin = 'http://localhost:5173'
const sessionCookie = 'cd_admin_session=github-session-token'

function snapshot() {
  return {
    username: 'heoposit',
    repositoryCount: 4,
    languageCount: 4,
    refreshedAt: new Date('2026-10-14T12:00:00.000Z'),
    lastAttemptAt: new Date('2026-10-14T12:00:00.000Z'),
  }
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const body = await response.json()
  return { response, body }
}

describe('GitHub summary HTTP contract', () => {
  let baseUrl
  let server
  let calls

  const authService = {
    async getAdminForToken(token) {
      if (token !== 'github-session-token') throw createError(401, 'Authentication required')
      return { id: 'admin-id', displayName: 'Owner', email: 'owner@example.com' }
    },
  }

  const githubService = {
    async getSummary() {
      calls.public += 1
      if (calls.failPublic) throw createError(503, 'GitHub summary is unavailable')
      return snapshot()
    },
    async refreshSnapshot() {
      calls.refresh += 1
      return snapshot()
    },
  }

  before(async () => {
    const environment = loadEnvironment({ NODE_ENV: 'test', CLIENT_ORIGINS: frontendOrigin })
    const app = createApp({ environment, authService, githubService })

    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1')
      server.once('listening', resolve)
      server.once('error', reject)
    })
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  beforeEach(() => {
    calls = { public: 0, refresh: 0, failPublic: false }
  })

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('returns an explicit cacheable public summary', async () => {
    const { response, body } = await requestJson(baseUrl, '/api/v1/github-summary')

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'public, max-age=0, s-maxage=60, stale-while-revalidate=300')
    assert.equal(response.headers.get('cdn-cache-control'), 'max-age=60, stale-while-revalidate=300')
    assert.deepEqual(body.data, {
      repositoryCount: 4,
      languageCount: 4,
      refreshedAt: '2026-10-14T12:00:00.000Z',
    })
    assert.equal('username' in body.data, false)
    assert.equal(calls.public, 1)
  })

  it('rejects unknown public queries and does not cache errors', async () => {
    const invalid = await requestJson(baseUrl, '/api/v1/github-summary?refresh=true')
    assert.equal(invalid.response.status, 400)
    assert.equal(invalid.response.headers.get('cache-control'), null)

    calls.failPublic = true
    const unavailable = await requestJson(baseUrl, '/api/v1/github-summary')
    assert.equal(unavailable.response.status, 503)
    assert.equal(unavailable.response.headers.get('cache-control'), null)
  })

  it('protects manual refresh with both session and trusted origin', async () => {
    const unauthenticated = await requestJson(baseUrl, '/api/v1/admin/github/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: frontendOrigin },
      body: '{}',
    })
    assert.equal(unauthenticated.response.status, 401)

    const missingOrigin = await requestJson(baseUrl, '/api/v1/admin/github/refresh', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: '{}',
    })
    assert.equal(missingOrigin.response.status, 403)
  })

  it('refreshes through the admin API with no-store and rejects unknown input', async () => {
    const refreshed = await requestJson(baseUrl, '/api/v1/admin/github/refresh', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
        origin: frontendOrigin,
      },
      body: '{}',
    })

    assert.equal(refreshed.response.status, 200)
    assert.equal(refreshed.response.headers.get('cache-control'), 'private, no-store')
    assert.equal(refreshed.body.data.username, 'heoposit')
    assert.equal('sourceEtag' in refreshed.body.data, false)
    assert.equal(calls.refresh, 1)

    const invalid = await requestJson(baseUrl, '/api/v1/admin/github/refresh?force=true', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
        origin: frontendOrigin,
      },
      body: JSON.stringify({ username: 'someone-else' }),
    })
    assert.equal(invalid.response.status, 400)
    assert.equal(calls.refresh, 1)
  })
})
