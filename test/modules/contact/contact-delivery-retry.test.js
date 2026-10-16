import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import mongoose from 'mongoose'

import { ContactInquiry } from '../../../src/modules/contact/contact-inquiry.js'
import { createContactService } from '../../../src/modules/contact/contact-service.js'

const inquiryId = new mongoose.Types.ObjectId('68f120000000000000000001')
const deliveryId = new mongoose.Types.ObjectId('68f120000000000000000002')
const retryAt = new Date('2026-10-16T12:00:00.000Z')
const idempotencyKey = '4cb756b9-4a95-4264-a843-d687b29b1e92'

function queryResult(value) {
  const query = {
    session() { return query },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject) },
  }
  return query
}

function inquiry(overrides = {}) {
  return new ContactInquiry({
    _id: inquiryId,
    name: 'Jordan Smith',
    email: 'jordan@example.com',
    message: 'A sufficiently detailed inquiry for retry testing.',
    scopes: ['backend-api'],
    budget: 'not-sure',
    submissionFingerprint: 'a'.repeat(64),
    ...overrides,
  })
}

function createHarness(existingInquiry = inquiry()) {
  const state = {
    command: null,
    requeueCalls: [],
    delivery: {
      _id: deliveryId,
      status: 'failed',
      lastFailureCode: 'provider-rejected',
      attemptCount: 1,
    },
  }
  function RetryCommand(values) {
    return {
      async save() {
        state.command = values
      },
    }
  }
  RetryCommand.findOne = ({ commandFingerprint }) => queryResult(
    state.command?.commandFingerprint === commandFingerprint ? state.command : null,
  )

  const emailDeliveryService = {
    async getContactOwnerNotification() { return state.delivery },
    async requeueFailedDelivery(id, date) {
      state.requeueCalls.push({ id, date })
      state.delivery = {
        ...state.delivery,
        status: 'pending',
        manualRetryCount: 1,
        lastManualRetryAt: date,
      }
      return state.delivery
    },
  }
  const service = createContactService({
    inquiryModel: { findById: () => queryResult(existingInquiry) },
    emailDeliveryService,
    contactReplyService: {},
    retryCommandModel: RetryCommand,
    runInTransaction: (operation) => operation('retry-session'),
    now: () => retryAt,
  })
  return { service, state }
}

describe('contact email retry service', () => {
  it('requeues a failed delivery once for an idempotent admin command', async () => {
    const { service, state } = createHarness()

    const first = await service.retryOwnerNotification(inquiryId, idempotencyKey)
    const replay = await service.retryOwnerNotification(inquiryId, idempotencyKey)

    assert.equal(first.status, 'pending')
    assert.equal(replay.status, 'pending')
    assert.equal(state.requeueCalls.length, 1)
    assert.equal(state.command.deliveryId, deliveryId)
  })

  it('rejects retry for archived inquiries and non-failed delivery state', async () => {
    const archived = createHarness(inquiry({ status: 'archived', archivedAt: retryAt }))
    await assert.rejects(
      archived.service.retryOwnerNotification(inquiryId, idempotencyKey),
      (error) => error.status === 409,
    )

    const active = createHarness()
    active.state.delivery.status = 'accepted'
    await assert.rejects(
      active.service.retryOwnerNotification(inquiryId, idempotencyKey),
      (error) => error.status === 409,
    )
  })
})
