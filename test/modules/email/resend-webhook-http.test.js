import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { createApp } from '../../../src/app.js'
import { loadEnvironment } from '../../../src/config/environment.js'

describe('Resend webhook HTTP boundary', () => {
  let baseUrl
  let server
  const calls = []

  before(async () => {
    const app = createApp({
      environment: loadEnvironment({ NODE_ENV: 'test' }),
      resendWebhookService: {
        async handle(body, headers) {
          calls.push({ body, headers })
        },
      },
    })
    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1')
      server.once('listening', resolve)
      server.once('error', reject)
    })
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('passes the untouched raw JSON body without browser or admin authentication', async () => {
    const payload = '{"type":"email.delivered","spacing":  true}'
    const response = await fetch(`${baseUrl}/api/v1/webhooks/resend`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'svix-id': 'event-id',
        'svix-timestamp': '123',
        'svix-signature': 'signature',
      },
      body: payload,
    })

    assert.equal(response.status, 200)
    assert.equal(Buffer.isBuffer(calls[0].body), true)
    assert.equal(calls[0].body.toString('utf8'), payload)
  })
})
