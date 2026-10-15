import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import mongoose from 'mongoose'

import { EmailDelivery } from '../../../src/modules/email/email-delivery.js'
import { createEmailDeliveryService } from '../../../src/modules/email/email-delivery-service.js'
import {
  emailDeliveryFailureCodes,
  emailDeliveryKinds,
  emailDeliveryStatuses,
} from '../../../src/modules/email/email-delivery-values.js'

const sourceId = new mongoose.Types.ObjectId('68f120000000000000000001')
const firstNow = new Date('2026-10-15T13:00:00.000Z')
const secondNow = new Date('2026-10-15T14:00:00.000Z')

function deliveryData(overrides = {}) {
  return {
    kind: 'contact-owner-notification',
    sourceId,
    status: 'pending',
    attemptCount: 0,
    nextAttemptAt: firstNow,
    ...overrides,
  }
}

function hasIndex(fields, expectedOptions = {}) {
  return EmailDelivery.schema.indexes().some(([indexFields, options]) => {
    return (
      JSON.stringify(indexFields) === JSON.stringify(fields) &&
      Object.entries(expectedOptions).every(([key, value]) => options[key] === value)
    )
  })
}

describe('EmailDelivery model', () => {
  it('stores a private pending job envelope without duplicating contact content', async () => {
    const delivery = new EmailDelivery(deliveryData())

    await delivery.validate()

    assert.equal(EmailDelivery.collection.collectionName, 'email_deliveries')
    assert.equal(delivery.status, 'pending')
    assert.equal(delivery.attemptCount, 0)
    assert.equal(delivery.nextAttemptAt.toISOString(), firstNow.toISOString())
    for (const field of ['name', 'email', 'message', 'scopes', 'budget', 'html', 'text']) {
      assert.equal(EmailDelivery.schema.path(field), undefined)
    }
  })

  it('accepts every internally consistent delivery lifecycle state', async () => {
    const states = [
      deliveryData(),
      deliveryData({
        status: 'processing',
        attemptCount: 1,
        nextAttemptAt: undefined,
        lastAttemptAt: firstNow,
        leaseUntil: secondNow,
      }),
      deliveryData({
        status: 'accepted',
        attemptCount: 1,
        nextAttemptAt: undefined,
        lastAttemptAt: firstNow,
        acceptedAt: secondNow,
        providerMessageId: 'resend-message-id',
      }),
      deliveryData({
        status: 'failed',
        attemptCount: 5,
        nextAttemptAt: undefined,
        lastAttemptAt: firstNow,
        failedAt: secondNow,
        lastFailureCode: 'timeout',
      }),
    ]

    for (const state of states) await new EmailDelivery(state).validate()

    assert.deepEqual(emailDeliveryKinds, ['contact-owner-notification'])
    assert.deepEqual(emailDeliveryStatuses, ['pending', 'processing', 'accepted', 'failed'])
    assert.deepEqual(emailDeliveryFailureCodes, [
      'configuration',
      'timeout',
      'rate-limited',
      'provider-rejected',
      'provider-error',
      'source-missing',
    ])
  })

  it('rejects contradictory delivery lifecycle states', async () => {
    const invalidStates = [
      deliveryData({ nextAttemptAt: undefined }),
      deliveryData({ status: 'pending', leaseUntil: secondNow }),
      deliveryData({ status: 'processing', nextAttemptAt: undefined }),
      deliveryData({
        status: 'processing',
        attemptCount: 1,
        nextAttemptAt: undefined,
        lastAttemptAt: firstNow,
      }),
      deliveryData({
        status: 'accepted',
        attemptCount: 1,
        nextAttemptAt: undefined,
        lastAttemptAt: firstNow,
        acceptedAt: secondNow,
      }),
      deliveryData({
        status: 'failed',
        attemptCount: 1,
        nextAttemptAt: undefined,
        lastAttemptAt: firstNow,
        failedAt: secondNow,
      }),
    ]

    for (const state of invalidStates) {
      await assert.rejects(new EmailDelivery(state).validate(), { name: 'ValidationError' })
    }
  })

  it('keeps provider identity private and defines uniqueness and dispatcher indexes', () => {
    assert.equal(EmailDelivery.schema.path('kind').options.immutable, true)
    assert.equal(EmailDelivery.schema.path('sourceId').options.immutable, true)
    assert.equal(EmailDelivery.schema.path('providerMessageId').options.select, false)

    assert.equal(hasIndex({ kind: 1, sourceId: 1 }, { unique: true }), true)
    assert.equal(hasIndex({ status: 1, nextAttemptAt: 1, createdAt: 1, _id: 1 }), true)
    assert.equal(hasIndex({ status: 1, leaseUntil: 1 }), true)
  })
})

describe('Email delivery service', () => {
  it('creates one pending contact-owner notification in the supplied transaction', async () => {
    const state = { saved: [], saveOptions: [] }

    function DeliveryModel(values) {
      const delivery = new EmailDelivery(values)
      delivery.save = async (options) => {
        await delivery.validate()
        state.saved.push(delivery)
        state.saveOptions.push(options)
        return delivery
      }
      return delivery
    }

    const service = createEmailDeliveryService({
      deliveryModel: DeliveryModel,
      now: () => firstNow,
    })
    const delivery = await service.createContactOwnerNotification(sourceId, {
      session: 'email-test-session',
    })

    assert.equal(delivery.kind, 'contact-owner-notification')
    assert.equal(delivery.sourceId.toString(), sourceId.toString())
    assert.equal(delivery.status, 'pending')
    assert.equal(delivery.attemptCount, 0)
    assert.equal(delivery.nextAttemptAt.toISOString(), firstNow.toISOString())
    assert.deepEqual(state.saveOptions, [{ session: 'email-test-session' }])
  })

  it('lists, retrieves, and deletes notification envelopes without contact payloads', async () => {
    const state = { filters: [], sessions: [], deletions: [] }
    const delivery = new EmailDelivery(deliveryData())

    function queryResult(value) {
      const query = {
        session(session) {
          state.sessions.push(session)
          return query
        },
        then(resolve, reject) {
          return Promise.resolve(value).then(resolve, reject)
        },
      }
      return query
    }

    const deliveryModel = {
      find(filter) {
        state.filters.push(filter)
        return queryResult([delivery])
      },
      findOne(filter) {
        state.filters.push(filter)
        return queryResult(delivery)
      },
      async deleteMany(filter, options) {
        state.deletions.push({ filter, options })
      },
    }
    const service = createEmailDeliveryService({ deliveryModel })

    const listed = await service.listContactOwnerNotifications([sourceId], {
      session: 'email-test-session',
    })
    const found = await service.getContactOwnerNotification(sourceId, {
      session: 'email-test-session',
    })
    await service.deleteContactDeliveries(sourceId, { session: 'email-test-session' })

    assert.deepEqual(listed, [delivery])
    assert.equal(found, delivery)
    assert.deepEqual(state.sessions, ['email-test-session', 'email-test-session'])
    assert.deepEqual(state.deletions, [
      {
        filter: { kind: 'contact-owner-notification', sourceId },
        options: { session: 'email-test-session' },
      },
    ])
  })
})
