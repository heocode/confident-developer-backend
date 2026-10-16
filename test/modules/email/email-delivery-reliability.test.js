import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import mongoose from 'mongoose'
import { Webhook } from 'svix'

import { EmailDelivery } from '../../../src/modules/email/email-delivery.js'
import { EmailDeliveryEvent } from '../../../src/modules/email/email-delivery-event.js'
import { EmailDeliveryRetryCommand } from '../../../src/modules/email/email-delivery-retry-command.js'
import { createResendWebhookService } from '../../../src/modules/email/resend-webhook-service.js'

const deliveryId = new mongoose.Types.ObjectId('68f120000000000000000001')
const sourceId = new mongoose.Types.ObjectId('68f120000000000000000002')
const now = new Date('2026-10-16T12:00:00.000Z')

function hasIndex(model, fields, expectedOptions = {}) {
  return model.schema.indexes().some(([indexFields, options]) => (
    JSON.stringify(indexFields) === JSON.stringify(fields) &&
    Object.entries(expectedOptions).every(([key, value]) => options[key] === value)
  ))
}

describe('email delivery reliability models', () => {
  it('validates recipient outcomes and manual retry metadata', async () => {
    const delivery = new EmailDelivery({
      kind: 'contact-owner-notification',
      sourceId,
      status: 'accepted',
      attemptCount: 1,
      lastAttemptAt: now,
      acceptedAt: now,
      providerMessageId: 'provider-id',
      recipientStatus: 'delivered',
      deliveredAt: now,
      manualRetryCount: 1,
      lastManualRetryAt: now,
    })
    await delivery.validate()

    await assert.rejects(
      new EmailDelivery({
        kind: 'contact-owner-notification',
        sourceId,
        status: 'pending',
        nextAttemptAt: now,
        recipientStatus: 'bounced',
      }).validate(),
      { name: 'ValidationError' },
    )
    assert.equal(hasIndex(EmailDelivery, { providerMessageId: 1 }, { unique: true, sparse: true }), true)
  })

  it('stores private idempotent webhook events and retry commands', async () => {
    const event = new EmailDeliveryEvent({
      providerEventId: 'msg_event',
      deliveryId,
      type: 'email.delivered',
      occurredAt: now,
      processedAt: now,
      expiresAt: new Date(now.getTime() + 1_000),
    })
    const command = new EmailDeliveryRetryCommand({
      deliveryId,
      commandFingerprint: 'a'.repeat(64),
    })
    await event.validate()
    await command.validate()

    assert.equal(EmailDeliveryEvent.collection.collectionName, 'email_delivery_events')
    assert.equal(hasIndex(EmailDeliveryEvent, { providerEventId: 1 }, { unique: true }), true)
    assert.equal(hasIndex(EmailDeliveryEvent, { expiresAt: 1 }, { expireAfterSeconds: 0 }), true)
    assert.equal(EmailDeliveryRetryCommand.schema.path('commandFingerprint').options.select, false)
  })
})

describe('Resend webhook verification', () => {
  it('verifies the raw payload and delegates a signed event exactly once', async () => {
    const secret = `whsec_${Buffer.alloc(32, 7).toString('base64')}`
    const webhook = new Webhook(secret)
    const timestamp = new Date()
    const id = 'msg_webhook_event'
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: now.toISOString(),
      data: { email_id: 'provider-id', tags: { delivery_id: deliveryId.toString() } },
    })
    const calls = []
    const service = createResendWebhookService({
      webhookSecret: secret,
      eventService: {
        async processProviderEvent(...arguments_) {
          calls.push(arguments_)
          return { processed: true }
        },
      },
    })
    const headers = {
      'svix-id': id,
      'svix-timestamp': String(Math.floor(timestamp.getTime() / 1_000)),
      'svix-signature': webhook.sign(id, timestamp, payload),
    }

    assert.deepEqual(await service.handle(Buffer.from(payload), headers), { processed: true })
    assert.equal(calls[0][0], id)
    assert.equal(calls[0][1].type, 'email.delivered')

    await assert.rejects(
      service.handle(Buffer.from(`${payload} `), headers),
      (error) => error.status === 400,
    )
  })

  it('fails closed when the webhook secret is absent', async () => {
    const service = createResendWebhookService({ eventService: {} })
    await assert.rejects(service.handle(Buffer.from('{}'), {}), (error) => error.status === 503)
  })
})
