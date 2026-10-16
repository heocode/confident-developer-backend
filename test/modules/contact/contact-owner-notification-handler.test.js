import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import mongoose from 'mongoose'

import { createContactOwnerNotificationHandler } from '../../../src/modules/contact/contact-owner-notification-handler.js'

const inquiryId = new mongoose.Types.ObjectId('68f120000000000000000001')
const deliveryId = new mongoose.Types.ObjectId('68f120000000000000000002')
const inquiry = {
  _id: inquiryId,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  message: 'Please build a reliable API for this product.',
  scopes: ['backend-api'],
  budget: '2500-5000',
  createdAt: new Date('2026-10-15T18:00:00.000Z'),
}

function selectable(value, selections) {
  return {
    select(selection) {
      selections.push(selection)
      return Promise.resolve(value)
    },
  }
}

describe('contact owner notification handler', () => {
  it('loads private inquiry content and sends one deterministic provider request', async () => {
    const selections = []
    const requests = []
    const handler = createContactOwnerNotificationHandler({
      emailProvider: {
        async sendEmail(request) {
          requests.push(request)
          return { providerMessageId: 'resend-message-id' }
        },
      },
      fromEmail: 'contact@example.com',
      notificationToEmail: 'owner@example.com',
      inquiryModel: {
        findById(id) {
          assert.equal(id, inquiryId)
          return selectable(inquiry, selections)
        },
      },
    })

    const result = await handler({ _id: deliveryId, sourceId: inquiryId })

    assert.deepEqual(result, { providerMessageId: 'resend-message-id' })
    assert.deepEqual(selections, ['+email +message'])
    assert.equal(requests.length, 1)
    assert.equal(requests[0].from, 'Confident Developer <contact@example.com>')
    assert.equal(requests[0].to, 'owner@example.com')
    assert.equal(requests[0].idempotencyKey, `contact-owner-notification/${deliveryId}`)
    assert.deepEqual(requests[0].tags, [{ name: 'delivery_id', value: deliveryId.toString() }])
    assert.match(requests[0].text, /ada@example.com/)
    assert.match(requests[0].text, /reliable API/)
  })

  it('fails permanently when the source inquiry no longer exists', async () => {
    const handler = createContactOwnerNotificationHandler({
      emailProvider: { sendEmail: async () => assert.fail('provider must not be called') },
      fromEmail: 'contact@example.com',
      notificationToEmail: 'owner@example.com',
      inquiryModel: {
        findById() {
          return selectable(null, [])
        },
      },
    })

    await assert.rejects(handler({ _id: deliveryId, sourceId: inquiryId }), {
      code: 'source-missing',
      retryable: false,
    })
  })
})
