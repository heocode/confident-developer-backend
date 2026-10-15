import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createCloudflareTurnstileProvider } from '../../../src/modules/anti-spam/providers/cloudflare-turnstile-provider.js'

const productionConfiguration = {
  secretKey: 'production-secret',
  testMode: false,
  expectedHostnames: ['portfolio.example'],
}

function jsonResponse(body, { ok = true } = {}) {
  return { ok, json: async () => body }
}

describe('Cloudflare Turnstile provider', () => {
  it('verifies a production token with the expected hostname and action', async () => {
    const calls = []
    const provider = createCloudflareTurnstileProvider(productionConfiguration, {
      fetchImpl: async (url, options) => {
        calls.push({ url, options })
        return jsonResponse({
          success: true,
          hostname: 'portfolio.example',
          action: 'reference_submit',
        })
      },
    })

    await provider.verify({
      token: 'verified-token',
      remoteIp: '203.0.113.10',
      action: 'reference_submit',
    })

    assert.equal(calls[0].url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
    assert.equal(calls[0].options.method, 'POST')
    assert.equal(calls[0].options.body.get('secret'), 'production-secret')
    assert.equal(calls[0].options.body.get('response'), 'verified-token')
    assert.equal(calls[0].options.body.get('remoteip'), '203.0.113.10')
  })

  it('rejects failed challenges and mismatched production metadata', async () => {
    for (const result of [
      { success: false, 'error-codes': ['invalid-input-response'] },
      { success: true, hostname: 'attacker.example', action: 'reference_submit' },
      { success: true, hostname: 'portfolio.example', action: 'contact_submit' },
    ]) {
      const provider = createCloudflareTurnstileProvider(productionConfiguration, {
        fetchImpl: async () => jsonResponse(result),
      })

      await assert.rejects(
        provider.verify({ token: 'token', action: 'reference_submit' }),
        (error) => error.status === 400 && error.message === 'Submission verification failed',
      )
    }
  })

  it('accepts official test-mode metadata without weakening production checks', async () => {
    const provider = createCloudflareTurnstileProvider(
      { secretKey: 'official-test-secret', testMode: true, expectedHostnames: ['localhost'] },
      {
        fetchImpl: async () =>
          jsonResponse({ success: true, hostname: 'localhost', action: 'test' }),
      },
    )

    await provider.verify({ token: 'XXXX.DUMMY.TOKEN.XXXX', action: 'reference_submit' })
  })

  it('fails safely when configuration or the provider is unavailable', async () => {
    const unconfigured = createCloudflareTurnstileProvider(null)
    await assert.rejects(
      unconfigured.verify({ token: 'token', action: 'reference_submit' }),
      (error) => error.status === 503,
    )

    for (const fetchImpl of [
      async () => {
        throw new Error('network failure')
      },
      async () => jsonResponse({}, { ok: false }),
      async () => ({ ok: true, json: async () => 'invalid' }),
    ]) {
      const provider = createCloudflareTurnstileProvider(productionConfiguration, { fetchImpl })
      await assert.rejects(
        provider.verify({ token: 'token', action: 'reference_submit' }),
        (error) => error.status === 503,
      )
    }
  })
})
