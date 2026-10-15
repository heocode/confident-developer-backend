import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import { createApp } from '../../../src/app.js'
import { loadEnvironment } from '../../../src/config/environment.js'

const frontendOrigin = 'http://localhost:5173'

function validPayload(overrides = {}) {
  return {
    name: 'Jordan Smith',
    email: 'jordan@example.com',
    message: 'I would like to discuss a portfolio application.',
    scopes: ['website-web-app', 'backend-api'],
    budget: '2500-5000',
    turnstileToken: 'verified-contact-token',
    website: '',
    ...overrides,
  }
}

async function requestJson(baseUrl, path, payload, origin = frontendOrigin) {
  const headers = { 'content-type': 'application/json' }
  if (origin) headers.origin = origin

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  const body = await response.json()
  return { response, body }
}

describe('public contact HTTP contract', () => {
  let baseUrl
  let server
  let calls
  let submissionError

  const contactService = {
    async submitInquiry(input, context) {
      calls.push({ input, context })
      if (submissionError) throw submissionError
    },
  }

  before(async () => {
    const environment = loadEnvironment({ NODE_ENV: 'test', CLIENT_ORIGINS: frontendOrigin })
    const app = createApp({
      environment,
      contactService,
      contactSubmissionRateLimitOptions: { limit: 100, windowMs: 60_000 },
    })

    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1')
      server.once('listening', resolve)
      server.once('error', reject)
    })
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  beforeEach(() => {
    calls = []
    submissionError = null
  })

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('normalizes and accepts a complete inquiry without returning private data', async () => {
    const { response, body } = await requestJson(
      baseUrl,
      '/api/v1/contact',
      validPayload({
        name: '  Jordan   Smith ',
        email: ' JORDAN@Example.COM ',
        message: ' First line.\r\nA second line with https://example.com details. ',
      }),
    )

    assert.equal(response.status, 201)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(body, {
      success: true,
      message: 'Your inquiry was sent successfully.',
    })
    assert.deepEqual(calls[0].input, {
      name: 'Jordan Smith',
      email: 'jordan@example.com',
      message: 'First line.\nA second line with https://example.com details.',
      scopes: ['website-web-app', 'backend-api'],
      budget: '2500-5000',
      turnstileToken: 'verified-contact-token',
      website: '',
    })
    assert.equal(typeof calls[0].context.remoteIp, 'string')
  })

  it('requires an exact trusted origin', async () => {
    const missing = await requestJson(baseUrl, '/api/v1/contact', validPayload(), null)
    const untrusted = await requestJson(
      baseUrl,
      '/api/v1/contact',
      validPayload(),
      'https://attacker.example',
    )

    assert.equal(missing.response.status, 403)
    assert.equal(untrusted.response.status, 403)
    assert.equal(calls.length, 0)
  })

  it('rejects missing, unknown, and client-owned fields with no-store errors', async () => {
    const invalidPayloads = [
      { ...validPayload(), name: undefined },
      { ...validPayload(), email: undefined },
      { ...validPayload(), message: undefined },
      { ...validPayload(), scopes: undefined },
      { ...validPayload(), budget: undefined },
      { ...validPayload(), turnstileToken: undefined },
      validPayload({ name: 'x' }),
      validPayload({ email: 'not-an-email' }),
      validPayload({ message: 'm'.repeat(5_001) }),
      validPayload({ turnstileToken: 't'.repeat(2_049) }),
      { ...validPayload(), status: 'read' },
      { ...validPayload(), readAt: '2026-10-15T12:00:00.000Z' },
      { ...validPayload(), submissionFingerprint: 'a'.repeat(64) },
    ]

    for (const payload of invalidPayloads) {
      const result = await requestJson(baseUrl, '/api/v1/contact', payload)
      assert.equal(result.response.status, 400)
      assert.equal(result.response.headers.get('cache-control'), 'private, no-store')
    }
    assert.equal(calls.length, 0)
  })

  it('rejects invalid options, duplicate scopes, honeypot content, and unknown queries', async () => {
    for (const payload of [
      validPayload({ scopes: [] }),
      validPayload({ scopes: ['backend-api', 'backend-api'] }),
      validPayload({ scopes: ['unknown'] }),
      validPayload({ budget: 'unlimited' }),
      validPayload({ website: 'spam.example' }),
      validPayload({ message: 'too short' }),
      validPayload({ turnstileToken: '' }),
    ]) {
      const result = await requestJson(baseUrl, '/api/v1/contact', payload)
      assert.equal(result.response.status, 400)
    }

    const query = await requestJson(baseUrl, '/api/v1/contact?unexpected=true', validPayload())
    assert.equal(query.response.status, 400)
    assert.equal(calls.length, 0)
  })

  it('preserves safe service errors without exposing or caching inquiry data', async () => {
    for (const [status, message] of [
      [400, 'Submission verification failed'],
      [409, 'This inquiry was already submitted recently'],
      [503, 'Submission verification is temporarily unavailable'],
    ]) {
      submissionError = Object.assign(new Error(message), { status })
      const result = await requestJson(baseUrl, '/api/v1/contact', validPayload())

      assert.equal(result.response.status, status)
      assert.equal(result.response.headers.get('cache-control'), 'private, no-store')
      assert.deepEqual(result.body, { success: false, message })
      assert.equal(JSON.stringify(result.body).includes('jordan@example.com'), false)
    }
  })

  it('does not expose a public contact read endpoint', async () => {
    const response = await fetch(`${baseUrl}/api/v1/contact`)
    const body = await response.json()

    assert.equal(response.status, 404)
    assert.deepEqual(body, { success: false, message: 'Route not found' })
  })
})

describe('contact submission rate limit', () => {
  it('limits contact attempts without affecting another public route', async () => {
    const environment = loadEnvironment({ NODE_ENV: 'test', CLIENT_ORIGINS: frontendOrigin })
    const contactService = { submitInquiry: async () => {} }
    const app = createApp({
      environment,
      contactService,
      contactSubmissionRateLimitOptions: { limit: 1, windowMs: 60_000 },
    })
    const server = await new Promise((resolve, reject) => {
      const listener = app.listen(0, '127.0.0.1')
      listener.once('listening', () => resolve(listener))
      listener.once('error', reject)
    })
    const baseUrl = `http://127.0.0.1:${server.address().port}`

    try {
      const accepted = await requestJson(baseUrl, '/api/v1/contact', validPayload())
      const limited = await requestJson(baseUrl, '/api/v1/contact', validPayload())
      const apiRoot = await fetch(`${baseUrl}/api/v1`)

      assert.equal(accepted.response.status, 201)
      assert.equal(limited.response.status, 429)
      assert.deepEqual(limited.body, {
        success: false,
        message: 'Too many contact submissions. Please try again later.',
      })
      assert.equal(apiRoot.status, 200)
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })
})
