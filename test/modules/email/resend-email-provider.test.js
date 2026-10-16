import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { EmailProviderError } from '../../../src/modules/email/email-provider-error.js'
import { createResendEmailProvider } from '../../../src/modules/email/providers/resend-email-provider.js'

const email = {
  from: 'Confident Developer <contact@example.com>',
  to: 'owner@example.com',
  replyTo: 'reply@example.com',
  subject: 'New inquiry',
  html: '<p>Hello</p>',
  text: 'Hello',
  idempotencyKey: 'contact-owner-notification/delivery-id',
}

describe('Resend email provider', () => {
  it('sends a bounded idempotent request and returns the provider message ID', async () => {
    const requests = []
    const provider = createResendEmailProvider({
      apiKey: 'private-api-key',
      fetchImplementation: async (...request) => {
        requests.push(request)
        return new Response(JSON.stringify({ id: 'resend-message-id' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    })

    const result = await provider.sendEmail(email)

    assert.deepEqual(result, { providerMessageId: 'resend-message-id' })
    assert.equal(requests[0][0], 'https://api.resend.com/emails')
    assert.equal(requests[0][1].method, 'POST')
    assert.equal(requests[0][1].headers.authorization, 'Bearer private-api-key')
    assert.equal(requests[0][1].headers['idempotency-key'], email.idempotencyKey)
    assert.deepEqual(JSON.parse(requests[0][1].body), {
      from: email.from,
      to: [email.to],
      reply_to: email.replyTo,
      subject: email.subject,
      html: email.html,
      text: email.text,
    })
    assert.ok(requests[0][1].signal instanceof AbortSignal)
  })

  it('classifies rate limits and observes Retry-After', async () => {
    const provider = createResendEmailProvider({
      apiKey: 'private-api-key',
      fetchImplementation: async () =>
        new Response('{}', { status: 429, headers: { 'retry-after': '12' } }),
    })

    await assert.rejects(provider.sendEmail(email), (error) => {
      assert.ok(error instanceof EmailProviderError)
      assert.equal(error.code, 'rate-limited')
      assert.equal(error.retryable, true)
      assert.equal(error.retryAfterMs, 12_000)
      return true
    })
  })

  it('separates permanent provider rejection from retryable provider failure', async () => {
    for (const [status, code, retryable] of [
      [400, 'provider-rejected', false],
      [503, 'provider-error', true],
    ]) {
      const provider = createResendEmailProvider({
        apiKey: 'private-api-key',
        fetchImplementation: async () => new Response('{}', { status }),
      })

      await assert.rejects(provider.sendEmail(email), (error) => {
        assert.equal(error.code, code)
        assert.equal(error.retryable, retryable)
        return true
      })
    }
  })

  it('classifies timeouts and invalid successful responses as retryable', async () => {
    const timeoutProvider = createResendEmailProvider({
      apiKey: 'private-api-key',
      fetchImplementation: async () => {
        const error = new Error('secret network detail')
        error.name = 'TimeoutError'
        throw error
      },
    })
    await assert.rejects(timeoutProvider.sendEmail(email), {
      code: 'timeout',
      retryable: true,
    })

    const invalidResponseProvider = createResendEmailProvider({
      apiKey: 'private-api-key',
      fetchImplementation: async () => new Response('{}', { status: 200 }),
    })
    await assert.rejects(invalidResponseProvider.sendEmail(email), {
      code: 'provider-error',
      retryable: true,
    })
  })
})
