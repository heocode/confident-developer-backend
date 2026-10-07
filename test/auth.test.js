import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import createError from 'http-errors'

import { createApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/environment.js'
import { AdminSession } from '../src/models/admin-session.js'
import { AdminUser } from '../src/models/admin-user.js'
import { getAdminSessionCookie } from '../src/utils/admin-session-cookie.js'

const frontendOrigin = 'http://localhost:5173'
const admin = {
  id: 'admin-id',
  displayName: 'Vadim',
  email: 'owner@example.com',
  passwordHash: 'must-not-leak',
}

function hasIndex(model, fields, expectedOptions = {}) {
  return model.schema.indexes().some(([indexFields, options]) => {
    const fieldsMatch = JSON.stringify(indexFields) === JSON.stringify(fields)
    const optionsMatch = Object.entries(expectedOptions).every(([key, value]) => options[key] === value)
    return fieldsMatch && optionsMatch
  })
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const body = await response.json()
  return { response, body }
}

describe('admin authentication HTTP contract', () => {
  let baseUrl
  let server
  let revokedToken

  const authService = {
    async login({ email, password }) {
      if (email !== admin.email || password !== 'correct-password') {
        throw createError(401, 'Invalid email or password')
      }

      return { admin, token: 'opaque-session-token' }
    },
    async getAdminForToken(token) {
      if (token !== 'opaque-session-token' || token === revokedToken) {
        throw createError(401, 'Authentication required')
      }

      return admin
    },
    async logout(token) {
      revokedToken = token
    },
  }

  before(async () => {
    const environment = loadEnvironment({
      NODE_ENV: 'test',
      CLIENT_ORIGINS: frontendOrigin,
    })
    const app = createApp({ environment, authService })

    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1')
      server.once('listening', resolve)
      server.once('error', reject)
    })

    const address = server.address()
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('requires an exact trusted origin for login', async () => {
    const { response, body } = await requestJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: admin.email, password: 'correct-password' }),
    })

    assert.equal(response.status, 403)
    assert.deepEqual(body, { success: false, message: 'Trusted origin is required' })
  })

  it('signs in with a host-only HttpOnly cookie and an explicit admin serializer', async () => {
    const { response, body } = await requestJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: frontendOrigin,
      },
      body: JSON.stringify({ email: ' OWNER@EXAMPLE.COM ', password: 'correct-password' }),
    })

    assert.equal(response.status, 200)
    assert.deepEqual(body, {
      success: true,
      message: 'Signed in successfully.',
      data: {
        id: admin.id,
        displayName: admin.displayName,
        email: admin.email,
      },
    })
    assert.equal('passwordHash' in body.data, false)
    assert.match(response.headers.get('set-cookie'), /^cd_admin_session=opaque-session-token;/)
    assert.match(response.headers.get('set-cookie'), /HttpOnly/)
    assert.match(response.headers.get('set-cookie'), /SameSite=Lax/)
    assert.match(response.headers.get('set-cookie'), /Path=\/api\/v1/)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
  })

  it('authenticates the session and protects the admin API', async () => {
    const cookie = 'cd_admin_session=opaque-session-token'
    const sessionResult = await requestJson(baseUrl, '/api/v1/auth/session', {
      headers: { cookie },
    })
    const adminResult = await requestJson(baseUrl, '/api/v1/admin', {
      headers: { cookie },
    })

    assert.equal(sessionResult.response.status, 200)
    assert.equal(sessionResult.body.data.id, admin.id)
    assert.equal(sessionResult.response.headers.get('cache-control'), 'private, no-store')
    assert.equal(adminResult.response.status, 200)
    assert.equal(adminResult.body.message, 'Admin API is available.')
    assert.equal(adminResult.response.headers.get('cache-control'), 'private, no-store')

    const missingSession = await requestJson(baseUrl, '/api/v1/admin')
    assert.equal(missingSession.response.status, 401)
    assert.deepEqual(missingSession.body, { success: false, message: 'Authentication required' })
  })

  it('returns generic credential errors and rejects unknown login fields', async () => {
    const invalidCredentials = await requestJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: frontendOrigin },
      body: JSON.stringify({ email: admin.email, password: 'wrong' }),
    })
    assert.equal(invalidCredentials.response.status, 401)
    assert.deepEqual(invalidCredentials.body, { success: false, message: 'Invalid email or password' })

    const unknownField = await requestJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: frontendOrigin },
      body: JSON.stringify({ email: admin.email, password: 'correct-password', role: 'admin' }),
    })
    assert.equal(unknownField.response.status, 400)
    assert.equal(unknownField.body.message, 'Request validation failed')
  })

  it('revokes the server-side session and clears the cookie on logout', async () => {
    const cookie = 'cd_admin_session=opaque-session-token'
    const logoutResult = await requestJson(baseUrl, '/api/v1/auth/logout', {
      method: 'POST',
      headers: { cookie, origin: frontendOrigin },
    })

    assert.equal(logoutResult.response.status, 200)
    assert.deepEqual(logoutResult.body, { success: true, message: 'Signed out successfully.' })
    assert.match(logoutResult.response.headers.get('set-cookie'), /^cd_admin_session=;/)
    assert.match(logoutResult.response.headers.get('set-cookie'), /Expires=/)
    assert.equal(logoutResult.response.headers.get('cache-control'), 'private, no-store')

    const revokedSession = await requestJson(baseUrl, '/api/v1/auth/session', {
      headers: { cookie },
    })
    assert.equal(revokedSession.response.status, 401)
  })
})

describe('admin persistence and cookie constraints', () => {
  it('defines unique credentials and expiring session indexes', () => {
    assert.equal(AdminUser.schema.path('passwordHash').options.select, false)
    assert.equal(AdminSession.schema.path('tokenHash').options.select, false)
    assert.equal(hasIndex(AdminUser, { email: 1 }, { unique: true }), true)
    assert.equal(hasIndex(AdminSession, { tokenHash: 1 }, { unique: true }), true)
    assert.equal(hasIndex(AdminSession, { expiresAt: 1 }, { expireAfterSeconds: 0 }), true)
    assert.equal(hasIndex(AdminSession, { admin: 1 }), true)
  })

  it('uses a Secure host-only cookie in production', () => {
    const cookie = getAdminSessionCookie({ nodeEnv: 'production' })

    assert.equal(cookie.name, '__Secure-cd_admin_session')
    assert.equal(cookie.options.httpOnly, true)
    assert.equal(cookie.options.secure, true)
    assert.equal(cookie.options.sameSite, 'lax')
    assert.equal(cookie.options.path, '/api/v1')
    assert.equal('domain' in cookie.options, false)
  })
})
