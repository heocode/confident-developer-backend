import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import mongoose from 'mongoose'

import { ContactInquiry } from '../../../src/modules/contact/contact-inquiry.js'
import { createContactReplyService } from '../../../src/modules/contact/contact-reply-service.js'
import { ContactReply } from '../../../src/modules/contact/contact-reply.js'

const inquiryId = new mongoose.Types.ObjectId('68f120000000000000000001')
const replyId = new mongoose.Types.ObjectId('68f120000000000000000002')
const deliveryId = new mongoose.Types.ObjectId('68f120000000000000000003')
const queuedAt = new Date('2026-10-15T18:00:00.000Z')
const acceptedAt = new Date('2026-10-15T18:01:00.000Z')
const idempotencyKey = 'e9a18202-ec50-4d3d-8cd6-455fde7d20b4'

function queryResult(value) {
  const query = {
    select() { return query },
    sort() { return query },
    session() { return query },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject) },
  }
  return query
}

function inquiryDocument(overrides = {}) {
  return new ContactInquiry({
    _id: inquiryId,
    name: 'Jordan Smith',
    email: 'jordan@example.com',
    message: 'Original inquiry with enough detail for a reply.',
    scopes: ['backend-api'],
    budget: 'not-sure',
    submissionFingerprint: 'a'.repeat(64),
    ...overrides,
  })
}

function createHarness(inquiry = inquiryDocument()) {
  const state = { reply: null, deliveries: [], deleted: false }

  function ReplyModel(values) {
    const reply = new ContactReply({ _id: replyId, ...values })
    reply.save = async () => {
      await reply.validate()
      reply.createdAt = queuedAt
      state.reply = reply
      return reply
    }
    return reply
  }
  ReplyModel.findOne = () => queryResult(state.reply)
  ReplyModel.findById = () => queryResult(state.reply)
  ReplyModel.find = () => queryResult(state.reply ? [state.reply] : [])
  ReplyModel.deleteMany = async () => { state.deleted = true }

  inquiry.save = async () => {
    await inquiry.validate()
    return inquiry
  }
  const inquiryModel = { findById: () => queryResult(inquiry) }
  const emailDeliveryService = {
    async createContactAdminReply(sourceId, options) {
      const delivery = {
        _id: deliveryId,
        kind: 'contact-admin-reply',
        sourceId,
        status: 'pending',
        attemptCount: 0,
        nextAttemptAt: options.nextAttemptAt,
      }
      state.deliveries.push(delivery)
      return delivery
    },
    async listContactAdminReplyDeliveries(sourceIds) {
      const ids = new Set(sourceIds.map(String))
      return state.deliveries.filter((delivery) => ids.has(String(delivery.sourceId)))
    },
    async markDeliveryAccepted(_id, attemptCount, providerMessageId, options) {
      assert.equal(attemptCount, 1)
      assert.equal(providerMessageId, 'provider-id')
      return { _id: deliveryId, status: 'accepted', acceptedAt: options.acceptedAt }
    },
    async deleteContactReplyDeliveries() { state.deliveries = [] },
  }
  let currentNow = queuedAt
  const service = createContactReplyService({
    replyModel: ReplyModel,
    inquiryModel,
    emailDeliveryService,
    runInTransaction: (operation) => operation('reply-test-session'),
    now: () => currentNow,
  })

  return {
    service,
    state,
    setNow(value) { currentNow = value },
  }
}

describe('contact reply service', () => {
  it('queues a normalized reply and marks a new inquiry read in one transaction', async () => {
    const inquiry = inquiryDocument()
    const { service, state } = createHarness(inquiry)

    const view = await service.queueReply(
      inquiryId,
      { message: '  Thank you.\r\nI will follow up shortly.  ' },
      idempotencyKey,
    )

    assert.equal(view.reply.message, 'Thank you.\nI will follow up shortly.')
    assert.equal(view.delivery.status, 'pending')
    assert.equal(inquiry.status, 'read')
    assert.equal(inquiry.readAt.toISOString(), queuedAt.toISOString())
    assert.equal(state.deliveries.length, 1)

    const replay = await service.queueReply(
      inquiryId,
      { message: 'Thank you.\nI will follow up shortly.' },
      idempotencyKey,
    )
    assert.equal(replay.reply, view.reply)
    assert.equal(state.deliveries.length, 1)
  })

  it('rejects replies to archived inquiries', async () => {
    const { service } = createHarness(
      inquiryDocument({ status: 'archived', archivedAt: queuedAt }),
    )

    await assert.rejects(
      service.queueReply(inquiryId, { message: 'Cannot send yet.' }, idempotencyKey),
      (error) => error.status === 409,
    )
  })

  it('rejects a different reply that reuses an idempotency key', async () => {
    const { service, state } = createHarness()
    await service.queueReply(inquiryId, { message: 'First reply.' }, idempotencyKey)

    await assert.rejects(
      service.queueReply(inquiryId, { message: 'Different reply.' }, idempotencyKey),
      (error) => error.status === 409,
    )
    assert.equal(state.deliveries.length, 1)
  })

  it('atomically accepts delivery and records the first replied transition', async () => {
    const inquiry = inquiryDocument({ status: 'read', readAt: queuedAt })
    const harness = createHarness(inquiry)
    await harness.service.queueReply(inquiryId, { message: 'Reply content.' }, idempotencyKey)
    harness.setNow(acceptedAt)

    const result = await harness.service.acceptReplyDelivery(
      { _id: deliveryId, sourceId: replyId, attemptCount: 1 },
      'provider-id',
    )

    assert.equal(result.status, 'accepted')
    assert.equal(inquiry.status, 'replied')
    assert.equal(inquiry.repliedAt.toISOString(), acceptedAt.toISOString())
    assert.equal(inquiry.readAt.toISOString(), queuedAt.toISOString())
  })

  it('records accepted delivery history without restoring an archived inquiry', async () => {
    const inquiry = inquiryDocument({ status: 'read', readAt: queuedAt })
    const harness = createHarness(inquiry)
    await harness.service.queueReply(inquiryId, { message: 'Reply content.' }, idempotencyKey)
    inquiry.status = 'archived'
    inquiry.archivedAt = queuedAt
    harness.setNow(acceptedAt)

    await harness.service.acceptReplyDelivery(
      { _id: deliveryId, sourceId: replyId, attemptCount: 1 },
      'provider-id',
    )

    assert.equal(inquiry.status, 'archived')
    assert.equal(inquiry.repliedAt.toISOString(), acceptedAt.toISOString())
    assert.equal(inquiry.archivedAt.toISOString(), queuedAt.toISOString())
  })

  it('deletes reply history and its delivery envelopes together', async () => {
    const harness = createHarness()
    await harness.service.queueReply(inquiryId, { message: 'Reply content.' }, idempotencyKey)

    await harness.service.deleteInquiryReplies(inquiryId, { session: 'reply-test-session' })

    assert.equal(harness.state.deleted, true)
    assert.equal(harness.state.deliveries.length, 0)
  })
})
