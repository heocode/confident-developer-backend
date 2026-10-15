import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createAntiSpamService } from '../../../src/modules/anti-spam/anti-spam-service.js'

describe('Anti-spam service', () => {
  it('uses separate fixed Turnstile actions for references and contact inquiries', async () => {
    const calls = []
    const turnstileProvider = {
      async verify(input) {
        calls.push(input)
        return true
      },
    }
    const service = createAntiSpamService({ turnstileProvider })

    await service.verifyReferenceSubmission({ token: 'reference-token', remoteIp: '203.0.113.1' })
    await service.verifyContactSubmission({ token: 'contact-token', remoteIp: '203.0.113.2' })

    assert.deepEqual(calls, [
      { token: 'reference-token', remoteIp: '203.0.113.1', action: 'reference_submit' },
      { token: 'contact-token', remoteIp: '203.0.113.2', action: 'contact_submit' },
    ])
  })
})
