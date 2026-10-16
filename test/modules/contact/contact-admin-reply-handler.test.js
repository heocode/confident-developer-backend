import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import mongoose from 'mongoose'

import { createContactAdminReplyHandler } from '../../../src/modules/contact/contact-admin-reply-handler.js'

const inquiryId = new mongoose.Types.ObjectId('68f120000000000000000001')
const replyId = new mongoose.Types.ObjectId('68f120000000000000000002')
const deliveryId = new mongoose.Types.ObjectId('68f120000000000000000003')

function selectable(value) {
  return { select: () => Promise.resolve(value) }
}

describe('contact admin reply handler', () => {
  it('sends to the visitor with owner Reply-To and delegates atomic acceptance', async () => {
    const requests = []
    const acceptances = []
    const delivery = { _id: deliveryId, sourceId: replyId, attemptCount: 1 }
    const handler = createContactAdminReplyHandler({
      emailProvider: {
        async sendEmail(request) {
          requests.push(request)
          return { providerMessageId: 'provider-id' }
        },
      },
      fromEmail: 'contact@example.com',
      replyToEmail: 'owner@example.com',
      contactReplyService: {
        async acceptReplyDelivery(...arguments_) {
          acceptances.push(arguments_)
          return { status: 'accepted' }
        },
      },
      replyModel: {
        findById: () => selectable({
          _id: replyId,
          inquiryId,
          message: 'Thank you for your message.',
        }),
      },
      inquiryModel: {
        findById: () => selectable({
          _id: inquiryId,
          name: 'Jordan',
          email: 'jordan@example.com',
          message: 'Original inquiry with sufficient context.',
          createdAt: new Date('2026-10-15T18:00:00.000Z'),
        }),
      },
    })

    const result = await handler.send(delivery)
    await handler.accept(delivery, result.providerMessageId)

    assert.equal(requests[0].to, 'jordan@example.com')
    assert.equal(requests[0].replyTo, 'owner@example.com')
    assert.equal(requests[0].from, 'Vadim Iskakov <contact@example.com>')
    assert.equal(requests[0].idempotencyKey, `contact-admin-reply/${deliveryId}`)
    assert.deepEqual(acceptances, [[delivery, 'provider-id']])
  })

  it('fails permanently when reply or inquiry source is absent', async () => {
    const base = {
      emailProvider: { sendEmail: async () => assert.fail('must not send') },
      fromEmail: 'contact@example.com',
      replyToEmail: 'owner@example.com',
      contactReplyService: {},
    }
    const missingReply = createContactAdminReplyHandler({
      ...base,
      replyModel: { findById: () => selectable(null) },
      inquiryModel: {},
    })
    await assert.rejects(missingReply.send({ sourceId: replyId }), { code: 'source-missing' })

    const missingInquiry = createContactAdminReplyHandler({
      ...base,
      replyModel: { findById: () => selectable({ inquiryId, message: 'Reply' }) },
      inquiryModel: { findById: () => selectable(null) },
    })
    await assert.rejects(missingInquiry.send({ sourceId: replyId }), { code: 'source-missing' })
  })
})
