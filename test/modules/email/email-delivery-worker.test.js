import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import mongoose from 'mongoose'

import { createEmailDeliveryWorker } from '../../../src/modules/email/email-delivery-worker.js'
import { EmailProviderError } from '../../../src/modules/email/email-provider-error.js'

const deliveryId = new mongoose.Types.ObjectId('68f120000000000000000002')
const now = new Date('2026-10-15T18:00:00.000Z')

function delivery(overrides = {}) {
  return {
    _id: deliveryId,
    kind: 'contact-owner-notification',
    attemptCount: 1,
    ...overrides,
  }
}

function createLogger() {
  const entries = []
  return {
    entries,
    info(message, context) {
      entries.push({ level: 'info', message, context })
    },
    warn(message, context) {
      entries.push({ level: 'warn', message, context })
    },
    error(message, context) {
      entries.push({ level: 'error', message, context })
    },
  }
}

describe('email delivery worker', () => {
  it('marks an atomically claimed delivery accepted', async () => {
    const accepted = []
    const logger = createLogger()
    const worker = createEmailDeliveryWorker({
      deliveryService: {
        claimNextDelivery: async () => delivery(),
        async markDeliveryAccepted(...arguments_) {
          accepted.push(arguments_)
          return { status: 'accepted' }
        },
      },
      handlers: new Map([
        ['contact-owner-notification', async () => ({ providerMessageId: 'provider-id' })],
      ]),
      logger,
    })

    assert.equal(await worker.processNext(), true)
    assert.deepEqual(accepted, [[deliveryId.toString(), 1, 'provider-id']])
    assert.equal(logger.entries[0].level, 'info')
    assert.deepEqual(Object.keys(logger.entries[0].context).sort(), [
      'attemptCount',
      'deliveryId',
      'kind',
    ])
  })

  it('reschedules retryable failures without logging inquiry content', async () => {
    const retries = []
    const logger = createLogger()
    const worker = createEmailDeliveryWorker({
      deliveryService: {
        claimNextDelivery: async () => delivery(),
        async rescheduleDelivery(...arguments_) {
          retries.push(arguments_)
          return { status: 'pending' }
        },
      },
      handlers: new Map([
        [
          'contact-owner-notification',
          async () => {
            throw new EmailProviderError('contains private provider detail', {
              code: 'rate-limited',
              retryable: true,
              retryAfterMs: 120_000,
            })
          },
        ],
      ]),
      logger,
      now: () => now,
    })

    await worker.processNext()

    assert.deepEqual(retries, [
      [deliveryId.toString(), 1, 'rate-limited', new Date('2026-10-15T18:02:00.000Z')],
    ])
    assert.equal(JSON.stringify(logger.entries).includes('private provider detail'), false)
    assert.equal(logger.entries[0].level, 'warn')
  })

  it('marks permanent and exhausted failures terminal', async () => {
    for (const [claimed, thrownError, expectedCode] of [
      [
        delivery(),
        new EmailProviderError('source missing', { code: 'source-missing', retryable: false }),
        'source-missing',
      ],
      [
        delivery({ attemptCount: 5 }),
        new EmailProviderError('timeout', { code: 'timeout', retryable: true }),
        'timeout',
      ],
    ]) {
      const failed = []
      const worker = createEmailDeliveryWorker({
        deliveryService: {
          claimNextDelivery: async () => claimed,
          async markDeliveryFailed(...arguments_) {
            failed.push(arguments_)
            return { status: 'failed' }
          },
        },
        handlers: new Map([
          [
            'contact-owner-notification',
            async () => {
              throw thrownError
            },
          ],
        ]),
        logger: createLogger(),
      })

      await worker.processNext()
      assert.deepEqual(failed, [[deliveryId.toString(), claimed.attemptCount, expectedCode]])
    }
  })

  it('treats a missing handler as a configuration failure', async () => {
    const failed = []
    const worker = createEmailDeliveryWorker({
      deliveryService: {
        claimNextDelivery: async () => delivery(),
        async markDeliveryFailed(...arguments_) {
          failed.push(arguments_)
          return { status: 'failed' }
        },
      },
      handlers: new Map(),
      logger: createLogger(),
    })

    await worker.processNext()
    assert.deepEqual(failed, [[deliveryId.toString(), 1, 'configuration']])
  })

  it('waits for the active delivery during graceful stop', async () => {
    let scheduledCallback
    let releaseHandler
    let handlerStartedResolve
    const handlerStarted = new Promise((resolve) => {
      handlerStartedResolve = resolve
    })
    const handlerBlocked = new Promise((resolve) => {
      releaseHandler = resolve
    })
    const worker = createEmailDeliveryWorker({
      deliveryService: {
        claimNextDelivery: async () => delivery(),
        markDeliveryAccepted: async () => ({ status: 'accepted' }),
      },
      handlers: new Map([
        [
          'contact-owner-notification',
          async () => {
            handlerStartedResolve()
            await handlerBlocked
            return { providerMessageId: 'provider-id' }
          },
        ],
      ]),
      logger: createLogger(),
      schedule(callback) {
        scheduledCallback = callback
        return { unref() {} }
      },
      cancelSchedule() {},
    })

    worker.start()
    scheduledCallback()
    await handlerStarted

    let stopped = false
    const stopping = worker.stop().then(() => {
      stopped = true
    })
    await Promise.resolve()
    assert.equal(stopped, false)

    releaseHandler()
    await stopping
    assert.equal(stopped, true)
  })
})
