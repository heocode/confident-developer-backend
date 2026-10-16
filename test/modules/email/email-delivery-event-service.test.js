import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import mongoose from 'mongoose'

import { createEmailDeliveryEventService } from '../../../src/modules/email/email-delivery-event-service.js'

const deliveryId = new mongoose.Types.ObjectId('68f120000000000000000001')
const sourceId = new mongoose.Types.ObjectId('68f120000000000000000002')
const occurredAt = new Date('2026-10-16T12:00:00.000Z')

function queryResult(value) {
  const query = {
    session() { return query },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject) },
  }
  return query
}

function createHarness() {
  const state = {
    events: new Set(),
    delivery: {
      _id: deliveryId,
      kind: 'contact-admin-reply',
      sourceId,
      status: 'processing',
      attemptCount: 1,
      recipientStatus: 'unknown',
    },
    outcomes: [],
    replyAcceptances: [],
  }

  function EventModel(values) {
    return {
      async save() {
        state.events.add(values.providerEventId)
      },
    }
  }
  EventModel.exists = ({ providerEventId }) => queryResult(state.events.has(providerEventId))

  const deliveryService = {
    async findById(id) {
      return id.toString() === deliveryId.toString() ? state.delivery : null
    },
    async findByProviderMessageId() { return null },
    async reconcileDeliveryAccepted(_id, providerMessageId, { acceptedAt }) {
      state.delivery.status = 'accepted'
      state.delivery.providerMessageId = providerMessageId
      state.delivery.acceptedAt = acceptedAt
      return state.delivery
    },
    async recordRecipientOutcome(_id, update) {
      state.outcomes.push(update)
      Object.assign(state.delivery, update)
      return state.delivery
    },
  }
  const service = createEmailDeliveryEventService({
    eventModel: EventModel,
    deliveryService,
    contactReplyService: {
      async recordReplyAcceptance(...arguments_) {
        state.replyAcceptances.push(arguments_)
      },
    },
    runInTransaction: (operation) => operation('event-session'),
    now: () => occurredAt,
  })
  return { service, state }
}

function event(type, date = occurredAt) {
  return {
    type,
    created_at: date.toISOString(),
    data: {
      email_id: 'provider-id',
      tags: { delivery_id: deliveryId.toString() },
    },
  }
}

describe('email delivery event service', () => {
  it('reconciles provider acceptance and records delivered outcome transactionally', async () => {
    const { service, state } = createHarness()
    const result = await service.processProviderEvent('event-1', event('email.delivered'))

    assert.equal(result.processed, true)
    assert.equal(state.delivery.status, 'accepted')
    assert.equal(state.delivery.recipientStatus, 'delivered')
    assert.equal(state.delivery.deliveredAt.toISOString(), occurredAt.toISOString())
    assert.equal(state.replyAcceptances.length, 1)
    assert.equal(state.events.has('event-1'), true)
  })

  it('deduplicates events and never lets an older lower-priority outcome regress state', async () => {
    const { service, state } = createHarness()
    await service.processProviderEvent('event-bounce', event('email.bounced'))
    const duplicate = await service.processProviderEvent('event-bounce', event('email.bounced'))
    const older = new Date(occurredAt.getTime() - 60_000)
    await service.processProviderEvent('event-delivered', event('email.delivered', older))

    assert.deepEqual(duplicate, { duplicate: true })
    assert.equal(state.delivery.recipientStatus, 'bounced')
    assert.equal(state.delivery.deliveredAt.toISOString(), older.toISOString())
    assert.equal(state.delivery.lastProviderEventAt.toISOString(), occurredAt.toISOString())
  })

  it('ignores unsupported or uncorrelated signed events', async () => {
    const { service, state } = createHarness()
    assert.deepEqual(await service.processProviderEvent('unknown', event('email.opened')), {
      ignored: true,
    })
    const missing = event('email.delivered')
    missing.data.tags.delivery_id = new mongoose.Types.ObjectId().toString()
    assert.deepEqual(await service.processProviderEvent('missing', missing), { ignored: true })
    assert.equal(state.events.size, 0)
  })
})
