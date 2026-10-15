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

function createSubmissionHarness({ duplicate = false, verificationError, existsError } = {}) {
  const state = { events: [], saved: [], existsFilters: [], verificationCalls: [] }

  function InquiryModel(values) {
    const inquiry = inquiryDocument(values)
    inquiry.save = async () => {
      state.events.push('save')
      await inquiry.validate()
      state.saved.push(inquiry)
      return inquiry
    }
    return inquiry
  }

  InquiryModel.exists = async (filter) => {
    state.events.push('duplicate-check')
    state.existsFilters.push(filter)
    if (existsError) throw existsError
    return duplicate ? { _id: inquiryId } : null
  }

  const antiSpamService = {
    async verifyContactSubmission(input) {
      state.events.push('verification')
      state.verificationCalls.push(input)
      if (verificationError) throw verificationError
    },
  }
  const service = createContactService({
    inquiryModel: InquiryModel,
    antiSpamService,
    now: () => firstNow,
  })

  return { service, state }
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

    assert.deepEqual(state.events, ['verification', 'duplicate-check', 'save'])
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
  })

  it('rejects a recent duplicate after verification without saving it', async () => {
    const { service, state } = createSubmissionHarness({ duplicate: true })

    await assert.rejects(
      service.submitInquiry(submissionInput()),
      (error) => error.status === 409 && error.message === 'This inquiry was already submitted recently',
    )

    assert.deepEqual(state.events, ['verification', 'duplicate-check'])
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
    assert.deepEqual(state.events, ['verification', 'duplicate-check'])
    assert.equal(state.saved.length, 0)
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

    assert.equal(result.status, 'archived')
    await result.validate()
  })

  it('returns the same active document when restore is repeated', async () => {
    const inquiry = inquiryDocument({ status: 'read', readAt: firstNow })
    const { service, state } = createHarness(inquiry)

    const result = await service.restoreInquiry(inquiryId)

    assert.equal(result, inquiry)
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
    })

    await assert.rejects(service.markInquiryRead(inquiryId), databaseError)
  })
})
