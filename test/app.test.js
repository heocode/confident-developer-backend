import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { createApp } from '../src/app.js'

describe('Express application', () => {
  let baseUrl
  let server

  before(async () => {
    await new Promise((resolve, reject) => {
      server = createApp().listen(0, '127.0.0.1')
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

  it('returns a successful health response', async () => {
    const response = await fetch(`${baseUrl}/api/health`)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(body, {
      success: true,
      message: 'API is healthy.',
      data: {
        database: 'disconnected',
      },
    })
  })

  it('serves the versioned API with security and rate-limit headers', async () => {
    const response = await fetch(`${baseUrl}/api/v1`)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(body, {
      success: true,
      message: 'Production API v1 is available.',
      data: { version: 'v1' },
    })
    assert.equal(response.headers.get('x-powered-by'), null)
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.ok(response.headers.get('ratelimit'))
  })

  it('returns structured errors for invalid versioned request input', async () => {
    const response = await fetch(`${baseUrl}/api/v1?unexpected=value`)
    const body = await response.json()

    assert.equal(response.status, 400)
    assert.equal(body.success, false)
    assert.equal(body.message, 'Request validation failed')
    assert.deepEqual(body.details, [
      {
        field: '',
        message: 'Unrecognized key: "unexpected"',
      },
    ])
  })

  it('keeps the coursework API disabled unless explicitly enabled', async () => {
    const response = await fetch(`${baseUrl}/api/users`)
    const body = await response.json()

    assert.equal(response.status, 404)
    assert.deepEqual(body, { success: false, message: 'Route not found' })
  })

  it('allows configured browser origins and rejects other origins', async () => {
    const allowedResponse = await fetch(`${baseUrl}/api/v1`, {
      headers: { origin: 'http://localhost:5173' },
    })
    assert.equal(allowedResponse.headers.get('access-control-allow-origin'), 'http://localhost:5173')
    assert.equal(allowedResponse.headers.get('access-control-allow-credentials'), 'true')

    const rejectedResponse = await fetch(`${baseUrl}/api/v1`, {
      headers: { origin: 'https://untrusted.example' },
    })
    const body = await rejectedResponse.json()

    assert.equal(rejectedResponse.status, 403)
    assert.deepEqual(body, { success: false, message: 'Origin is not allowed by CORS' })
    assert.equal(rejectedResponse.headers.get('access-control-allow-origin'), null)
  })

  it('returns the shared error shape for an unknown route', async () => {
    const response = await fetch(`${baseUrl}/not-found`)
    const body = await response.json()

    assert.equal(response.status, 404)
    assert.deepEqual(body, {
      success: false,
      message: 'Route not found',
    })
  })

  it('rate-limits the production API using the shared error contract', async () => {
    const limitedApp = createApp({ apiRateLimitOptions: { limit: 2, windowMs: 60_000 } })
    let limitedServer

    await new Promise((resolve, reject) => {
      limitedServer = limitedApp.listen(0, '127.0.0.1')
      limitedServer.once('listening', resolve)
      limitedServer.once('error', reject)
    })

    try {
      const address = limitedServer.address()
      const limitedBaseUrl = `http://127.0.0.1:${address.port}`

      await fetch(`${limitedBaseUrl}/api/v1`)
      await fetch(`${limitedBaseUrl}/api/v1`)
      const response = await fetch(`${limitedBaseUrl}/api/v1`)
      const body = await response.json()

      assert.equal(response.status, 429)
      assert.deepEqual(body, {
        success: false,
        message: 'Too many requests. Please try again later.',
      })
    } finally {
      await new Promise((resolve, reject) => {
        limitedServer.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })
})
