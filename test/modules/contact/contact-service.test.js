import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import mongoose from 'mongoose'

import { ContactInquiry } from '../../../src/modules/contact/contact-inquiry.js'
import {
  createContactService,
  createContactSubmissionFingerprint,
} from '../../../src/modules/contact/contact-service.js'

const inquiryId = '68f120000000000000000001'
const firstNow = new Date('2026-10-15T13:00:00.000Z')
const secondNow = new Date('2026-10-15T14:00:00.000Z')
const fingerprint = 'a'.repeat(64)

function emptyEmailDeliveryService(overrides = {}) {
  return {
    async createContactOwnerNotification() {},
    async listContactOwnerNotifications() { return [] },
    async getContactOwnerNotification() { return null },
    async deleteContactDeliveries() {},
    ...overrides,
  }
}

async function runInlineTransaction(operation) {
  return operation('contact-test-session')
}

function inquiryDocument(overrides = {}) {
  return new ContactInquiry({
    _id: new mongoose.Types.ObjectId(inquiryId),
    name: 'Jordan Smith',
    email: 'jordan@example.com',
    message: 'I would like to discuss a portfolio application.',
    scopes: ['website-web-app', 'backend-api'],
    budget: '2500-5000',
    submissionFingerprint: fingerprint,
    ...overrides,
  })
}

function matchesStatus(actualStatus, expectedStatus) {
  if (typeof expectedStatus === 'string') return actualStatus === expectedStatus
  if (expectedStatus?.$ne) return actualStatus !== expectedStatus.$ne
  return true
}

function applyUpdate(document, update) {
  for (const [path, value] of Object.entries(update.$set ?? {})) document.set(path, value)
  for (const path of Object.keys(update.$unset ?? {})) document.set(path, undefined)
}

function createHarness(existingInquiry = null, dates = [firstNow]) {
  const state = { inquiry: existingInquiry, saved: [], updates: [], findByIdCalls: [] }
  let dateIndex = 0

  function InquiryModel(values) {
    const inquiry = inquiryDocument(values)
    inquiry.save = async () => {
      await inquiry.validate()
      state.saved.push(inquiry)
      state.inquiry = inquiry
      return inquiry
    }
    return inquiry
  }

  InquiryModel.findById = async (id) => {
    state.findByIdCalls.push(id)
    return state.inquiry
  }
  InquiryModel.findOneAndUpdate = async (filter, update, options) => {
    state.updates.push({ filter, update, options })
    if (!state.inquiry || state.inquiry.id !== filter._id) return null
    if (!matchesStatus(state.inquiry.status, filter.status)) return null

    applyUpdate(state.inquiry, update)
    await state.inquiry.validate()
    return state.inquiry
  }

  const service = createContactService({
    inquiryModel: InquiryModel,
    emailDeliveryService: emptyEmailDeliveryService(),
    runInTransaction: runInlineTransaction,
    now: () => dates[Math.min(dateIndex++, dates.length - 1)],
  })

  return { service, state }
}

function submissionInput(overrides = {}) {
  return {
    name: 'Jordan Smith',
    email: 'jordan@example.com',
    message: 'I would like to discuss a portfolio application at https://example.com.',
    scopes: ['website-web-app', 'backend-api'],
    budget: '2500-5000',
    turnstileToken: 'verified-contact-token',
    website: '',
    ...overrides,
  }
}

function createSubmissionHarness({
  duplicate = false,
  verificationError,
  existsError,
  deliveryError,
} = {}) {
  const state = {
    events: [],
    saved: [],
    saveOptions: [],
    existsFilters: [],
    existsOperations: [],
    verificationCalls: [],
    deliveryCalls: [],
    persistedDeliveries: [],
  }

  function InquiryModel(values) {
    const inquiry = inquiryDocument(values)
    inquiry.save = async (options) => {
      state.events.push('save')
      state.saveOptions.push(options)
      await inquiry.validate()
      state.saved.push(inquiry)
      return inquiry
    }
    return inquiry
  }

  InquiryModel.exists = (filter) => {
    state.events.push('duplicate-check')
    state.existsFilters.push(filter)
    const result = existsError
      ? Promise.reject(existsError)
      : duplicate
        ? { _id: inquiryId }
        : null
    return queryResult(result, state.existsOperations)
  }

  const antiSpamService = {
    async verifyContactSubmission(input) {
      state.events.push('verification')
      state.verificationCalls.push(input)
      if (verificationError) throw verificationError
    },
  }
  const emailDeliveryService = emptyEmailDeliveryService({
    async createContactOwnerNotification(sourceId, options) {
      state.events.push('delivery-save')
      state.deliveryCalls.push({ sourceId: sourceId.toString(), options })
      if (deliveryError) throw deliveryError
      state.persistedDeliveries.push(sourceId.toString())
    },
  })
  const service = createContactService({
    inquiryModel: InquiryModel,
    antiSpamService,
    emailDeliveryService,
    runInTransaction: async (operation) => {
      state.events.push('transaction-start')
      try {
        const result = await operation('contact-test-session')
        state.events.push('transaction-commit')
        return result
      } catch (error) {
        state.events.push('transaction-rollback')
        state.saved.length = 0
        state.persistedDeliveries.length = 0
        throw error
      }
    },
    now: () => firstNow,
  })

  return { service, state }
}

function queryResult(value, operations) {
  const query = {
    select(selection) {
      operations.push({ operation: 'select', value: selection })
      return query
    },
    sort(sort) {
      operations.push({ operation: 'sort', value: sort })
      return query
    },
    skip(skip) {
      operations.push({ operation: 'skip', value: skip })
      return query
    },
    limit(limit) {
      operations.push({ operation: 'limit', value: limit })
      return query
    },
    session(session) {
      operations.push({ operation: 'session', value: session })
      return query
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject)
    },
  }

  return query
}

function createAdminHarness(inquiries = [], deliveries = []) {
  const state = {
    inquiries: [...inquiries],
    deliveries: [...deliveries],
    findFilters: [],
    findOperations: [],
    findByIdCalls: [],
    detailOperations: [],
    countFilters: [],
    deletionFilters: [],
    deliveryListCalls: [],
    deliveryGetCalls: [],
    deliveryDeleteCalls: [],
  }
  const inquiryModel = {
    find(filter) {
      state.findFilters.push(filter)
      const items = filter.status
        ? state.inquiries.filter((inquiry) => inquiry.status === filter.status)
        : state.inquiries
      return queryResult(items, state.findOperations)
    },
    findById(id) {
      state.findByIdCalls.push(id)
      const inquiry = state.inquiries.find((item) => item.id === id) ?? null
      return queryResult(inquiry, state.detailOperations)
    },
    async countDocuments(filter) {
      state.countFilters.push(filter)
      return filter.status
        ? state.inquiries.filter((inquiry) => inquiry.status === filter.status).length
        : state.inquiries.length
    },
    async findOneAndDelete(filter) {
      state.deletionFilters.push(filter)
      const index = state.inquiries.findIndex(
        (inquiry) => inquiry.id === filter._id && inquiry.status === filter.status,
      )
      if (index === -1) return null
      return state.inquiries.splice(index, 1)[0]
    },
  }

  const emailDeliveryService = emptyEmailDeliveryService({
    async listContactOwnerNotifications(sourceIds) {
      state.deliveryListCalls.push(sourceIds.map((id) => id.toString()))
      const keys = new Set(sourceIds.map((id) => id.toString()))
      return state.deliveries.filter((delivery) => keys.has(delivery.sourceId.toString()))
    },
    async getContactOwnerNotification(sourceId) {
      state.deliveryGetCalls.push(sourceId.toString())
      return state.deliveries.find((delivery) => delivery.sourceId.toString() === sourceId.toString()) ?? null
    },
    async deleteContactDeliveries(sourceId, options) {
      state.deliveryDeleteCalls.push({ sourceId: sourceId.toString(), options })
      state.deliveries = state.deliveries.filter(
        (delivery) => delivery.sourceId.toString() !== sourceId.toString(),
      )
    },
  })

  return {
    service: createContactService({
      inquiryModel,
      emailDeliveryService,
      runInTransaction: runInlineTransaction,
    }),
    state,
  }
}

describe('Contact service', () => {
  it('normalizes and creates a new inquiry with a server-owned fingerprint', async () => {
    const { service, state } = createHarness()
    const inquiry = await service.createInquiry({
      name: '  Jordan   Smith  ',
      email: '  JORDAN@Example.COM ',
      message: '  First line.\r\nSecond line contains enough detail.  ',
      scopes: ['website-web-app', 'backend-api'],
      budget: '2500-5000',
      status: 'archived',
      archivedAt: firstNow,
    })

    assert.equal(inquiry.name, 'Jordan Smith')
    assert.equal(inquiry.email, 'jordan@example.com')
    assert.equal(inquiry.message, 'First line.\nSecond line contains enough detail.')
    assert.equal(inquiry.status, 'new')
    assert.equal(inquiry.archivedAt, undefined)
    assert.equal(state.saved.length, 1)
    assert.equal(
      inquiry.submissionFingerprint,
      createHash('sha256')
        .update('jordan@example.com\0First line.\nSecond line contains enough detail.')
        .digest('hex'),
    )
  })

  it('generates the same fingerprint for equivalent normalized submissions', () => {
    const first = createContactSubmissionFingerprint({
      email: ' Person@Example.com ',
      message: 'A detailed message.\r\nWith a second line.',
    })
    const second = createContactSubmissionFingerprint({
      email: 'person@example.com',
      message: 'A detailed message.\nWith a second line.',
    })

    assert.equal(first, second)
  })

  it('verifies, deduplicates, and stores an accepted public submission in order', async () => {
    const { service, state } = createSubmissionHarness()

    const inquiry = await service.submitInquiry(submissionInput(), { remoteIp: '203.0.113.10' })

    assert.deepEqual(state.events, [
      'verification',
      'transaction-start',
      'duplicate-check',
      'save',
      'delivery-save',
      'transaction-commit',
    ])
    assert.deepEqual(state.verificationCalls, [
      { token: 'verified-contact-token', remoteIp: '203.0.113.10' },
    ])
    assert.deepEqual(state.existsFilters, [
      {
        submissionFingerprint: inquiry.submissionFingerprint,
        createdAt: { $gte: new Date(firstNow.getTime() - 24 * 60 * 60 * 1_000) },
      },
    ])
    assert.equal(inquiry.status, 'new')
    assert.equal(inquiry.message.includes('https://example.com'), true)
    assert.equal('turnstileToken' in inquiry.toObject(), false)
    assert.equal('website' in inquiry.toObject(), false)
    assert.deepEqual(state.saveOptions, [{ session: 'contact-test-session' }])
    assert.deepEqual(state.existsOperations, [
      { operation: 'session', value: 'contact-test-session' },
    ])
    assert.deepEqual(state.deliveryCalls, [
      {
        sourceId: inquiryId,
        options: { session: 'contact-test-session', nextAttemptAt: firstNow },
      },
    ])
    assert.deepEqual(state.persistedDeliveries, [inquiryId])
  })

  it('rejects a recent duplicate after verification without saving it', async () => {
    const { service, state } = createSubmissionHarness({ duplicate: true })

    await assert.rejects(
      service.submitInquiry(submissionInput()),
      (error) => error.status === 409 && error.message === 'This inquiry was already submitted recently',
    )

    assert.deepEqual(state.events, [
      'verification',
      'transaction-start',
      'duplicate-check',
      'transaction-rollback',
    ])
    assert.equal(state.saved.length, 0)
  })

  it('fails before database access when verification is unavailable or rejected', async () => {
    const providerError = Object.assign(new Error('Submission verification failed'), { status: 400 })
    const failed = createSubmissionHarness({ verificationError: providerError })

    await assert.rejects(failed.service.submitInquiry(submissionInput()), providerError)
    assert.deepEqual(failed.state.events, ['verification'])

    const unavailable = createContactService({ inquiryModel: {} })
    await assert.rejects(
      unavailable.submitInquiry(submissionInput()),
      (error) => error.status === 503 && error.message.includes('temporarily unavailable'),
    )
  })

  it('propagates a database failure after successful verification without saving', async () => {
    const databaseError = new Error('database unavailable')
    const { service, state } = createSubmissionHarness({ existsError: databaseError })

    await assert.rejects(service.submitInquiry(submissionInput()), databaseError)
    assert.deepEqual(state.events, [
      'verification',
      'transaction-start',
      'duplicate-check',
      'transaction-rollback',
    ])
    assert.equal(state.saved.length, 0)
  })

  it('rolls back the inquiry when the outbox delivery cannot be saved', async () => {
    const deliveryError = new Error('delivery unavailable')
    const { service, state } = createSubmissionHarness({ deliveryError })

    await assert.rejects(service.submitInquiry(submissionInput()), deliveryError)

    assert.deepEqual(state.events, [
      'verification',
      'transaction-start',
      'duplicate-check',
      'save',
      'delivery-save',
      'transaction-rollback',
    ])
    assert.equal(state.saved.length, 0)
    assert.equal(state.persistedDeliveries.length, 0)
  })

  it('marks a new inquiry read without replacing its original read date', async () => {
    const inquiry = inquiryDocument()
    const { service, state } = createHarness(inquiry, [firstNow, secondNow])

    await service.markInquiryRead(inquiryId)
    await service.markInquiryRead(inquiryId)

    assert.equal(inquiry.status, 'read')
    assert.equal(inquiry.readAt.toISOString(), firstNow.toISOString())
    assert.equal(state.updates.length, 2)
    assert.deepEqual(state.updates[0].filter, { _id: inquiryId, status: 'new' })
  })

  it('archives every active state while preserving its lifecycle history', async () => {
    for (const inquiry of [
      inquiryDocument(),
      inquiryDocument({ status: 'read', readAt: firstNow }),
      inquiryDocument({ status: 'replied', readAt: firstNow, repliedAt: secondNow }),
    ]) {
      const { service } = createHarness(inquiry, [secondNow])

      await service.archiveInquiry(inquiryId)

      assert.equal(inquiry.status, 'archived')
      assert.equal(inquiry.archivedAt.toISOString(), secondNow.toISOString())
    }
  })

  it('does not replace the date of an already archived inquiry', async () => {
    const inquiry = inquiryDocument({ status: 'archived', archivedAt: firstNow })
    const { service } = createHarness(inquiry, [secondNow])

    await service.archiveInquiry(inquiryId)

    assert.equal(inquiry.archivedAt.toISOString(), firstNow.toISOString())
  })

  it('restores archived inquiries from their retained lifecycle dates', async () => {
    const cases = [
      { inquiry: inquiryDocument({ status: 'archived', archivedAt: secondNow }), expected: 'new' },
      {
        inquiry: inquiryDocument({ status: 'archived', readAt: firstNow, archivedAt: secondNow }),
        expected: 'read',
      },
      {
        inquiry: inquiryDocument({
          status: 'archived',
          readAt: firstNow,
          repliedAt: secondNow,
          archivedAt: secondNow,
        }),
        expected: 'replied',
      },
    ]

    for (const { inquiry, expected } of cases) {
      const { service } = createHarness(inquiry)

      await service.restoreInquiry(inquiryId)

      assert.equal(inquiry.status, expected)
      assert.equal(inquiry.archivedAt, undefined)
    }
  })

  it('keeps a valid result when read and archive operations race', async () => {
    const inquiry = inquiryDocument({ status: 'archived', archivedAt: firstNow })
    const { service } = createHarness(inquiry)

    const result = await service.markInquiryRead(inquiryId)

    assert.equal(result.inquiry.status, 'archived')
    await result.inquiry.validate()
  })

  it('returns the same active document when restore is repeated', async () => {
    const inquiry = inquiryDocument({ status: 'read', readAt: firstNow })
    const { service, state } = createHarness(inquiry)

    const result = await service.restoreInquiry(inquiryId)

    assert.equal(result.inquiry, inquiry)
    assert.equal(state.updates.length, 0)
  })

  it('returns a safe not-found error and propagates database failures', async () => {
    const missing = createHarness()

    await assert.rejects(
      missing.service.restoreInquiry(inquiryId),
      (error) => error.status === 404 && error.message === 'Contact inquiry not found',
    )

    const databaseError = new Error('database unavailable')
    const service = createContactService({
      inquiryModel: {
        findOneAndUpdate: async () => {
          throw databaseError
        },
      },
      emailDeliveryService: emptyEmailDeliveryService(),
    })

    await assert.rejects(service.markInquiryRead(inquiryId), databaseError)
  })

  it('lists admin inquiries with private email selection and deterministic pagination', async () => {
    const inquiries = [
      inquiryDocument({ status: 'read', readAt: firstNow }),
      inquiryDocument({ _id: new mongoose.Types.ObjectId(), email: 'second@example.com' }),
    ]
    const ownerNotification = {
      sourceId: inquiries[0]._id,
      status: 'pending',
      attemptCount: 0,
    }
    const { service, state } = createAdminHarness(inquiries, [ownerNotification])

    const result = await service.listAdminInquiries({ status: 'read', page: 2, limit: 10 })

    assert.deepEqual(result.items, [{ inquiry: inquiries[0], ownerNotification }])
    assert.deepEqual(result.pagination, {
      page: 2,
      limit: 10,
      totalItems: 1,
      totalPages: 1,
    })
    assert.deepEqual(state.findFilters, [{ status: 'read' }])
    assert.deepEqual(state.countFilters, [{ status: 'read' }])
    assert.deepEqual(state.findOperations, [
      { operation: 'select', value: '+email' },
      { operation: 'sort', value: { createdAt: -1, _id: -1 } },
      { operation: 'skip', value: 10 },
      { operation: 'limit', value: 10 },
    ])
    assert.deepEqual(state.deliveryListCalls, [[inquiries[0].id]])
  })

  it('selects private email and message for admin detail without selecting the fingerprint', async () => {
    const inquiry = inquiryDocument()
    const { service, state } = createAdminHarness([inquiry])

    const result = await service.getAdminInquiry(inquiryId)

    assert.equal(result.inquiry, inquiry)
    assert.equal(result.ownerNotification, null)
    assert.deepEqual(state.detailOperations, [
      { operation: 'select', value: '+email +message' },
    ])
  })

  it('deletes only archived inquiries', async () => {
    const archived = inquiryDocument({ status: 'archived', archivedAt: firstNow })
    const archivedHarness = createAdminHarness(
      [archived],
      [{ sourceId: archived._id, status: 'pending', attemptCount: 0 }],
    )

    await archivedHarness.service.deleteArchivedInquiry(inquiryId)

    assert.equal(archivedHarness.state.inquiries.length, 0)
    assert.deepEqual(archivedHarness.state.deletionFilters, [
      { _id: inquiryId, status: 'archived' },
    ])
    assert.deepEqual(archivedHarness.state.deliveryDeleteCalls, [
      {
        sourceId: inquiryId,
        options: { session: 'contact-test-session' },
      },
    ])
    assert.equal(archivedHarness.state.deliveries.length, 0)

    const activeHarness = createAdminHarness([inquiryDocument()])
    await assert.rejects(
      activeHarness.service.deleteArchivedInquiry(inquiryId),
      (error) =>
        error.status === 409 &&
        error.message === 'Contact inquiry must be archived before deletion',
    )

    const missingHarness = createAdminHarness()
    await assert.rejects(
      missingHarness.service.deleteArchivedInquiry(inquiryId),
      (error) => error.status === 404 && error.message === 'Contact inquiry not found',
    )
  })
})
