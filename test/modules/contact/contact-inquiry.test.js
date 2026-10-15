import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ContactInquiry } from '../../../src/modules/contact/contact-inquiry.js'
import {
  contactInquiryBudgets,
  contactInquiryScopes,
  contactInquiryStatuses,
} from '../../../src/modules/contact/contact-inquiry-values.js'

const fingerprint = 'a'.repeat(64)
const readAt = new Date('2026-10-15T13:00:00.000Z')
const repliedAt = new Date('2026-10-15T14:00:00.000Z')
const archivedAt = new Date('2026-10-15T15:00:00.000Z')

function hasIndex(model, fields) {
  return model.schema.indexes().some(([indexFields]) => {
    return JSON.stringify(indexFields) === JSON.stringify(fields)
  })
}

function inquiryData(overrides = {}) {
  return {
    name: 'Jordan Smith',
    email: 'jordan@example.com',
    message: 'I would like to discuss a portfolio application.',
    scopes: ['website-web-app', 'backend-api'],
    budget: '2500-5000',
    submissionFingerprint: fingerprint,
    ...overrides,
  }
}

async function validationErrors(overrides) {
  try {
    await new ContactInquiry(inquiryData(overrides)).validate()
  } catch (error) {
    assert.equal(error.name, 'ValidationError')
    return error.errors
  }

  assert.fail('Expected validation to fail')
}

describe('ContactInquiry model', () => {
  it('stores new inquiries in the isolated contact collection', async () => {
    const inquiry = new ContactInquiry(
      inquiryData({ email: '  Jordan@Example.COM  ', message: '  A sufficiently long message.  ' }),
    )

    await inquiry.validate()

    assert.equal(ContactInquiry.collection.collectionName, 'contact_inquiries')
    assert.equal(inquiry.email, 'jordan@example.com')
    assert.equal(inquiry.message, 'A sufficiently long message.')
    assert.equal(inquiry.status, 'new')
    assert.equal(inquiry.readAt, undefined)
    assert.equal(inquiry.repliedAt, undefined)
    assert.equal(inquiry.archivedAt, undefined)
  })

  it('requires every contact field and bounds text values', async () => {
    const missing = await validationErrors({
      name: undefined,
      email: undefined,
      message: undefined,
      scopes: undefined,
      budget: undefined,
      submissionFingerprint: undefined,
    })
    const invalid = await validationErrors({
      name: 'x',
      email: 'not-an-email',
      message: 'too short',
      submissionFingerprint: 'invalid',
    })
    const oversized = await validationErrors({
      name: 'n'.repeat(81),
      email: `${'e'.repeat(243)}@example.com`,
      message: 'm'.repeat(5_001),
    })

    for (const field of ['name', 'email', 'message', 'scopes', 'budget', 'submissionFingerprint']) {
      assert.ok(missing[field], `${field} should be required`)
    }
    for (const field of ['name', 'email', 'message', 'submissionFingerprint']) {
      assert.ok(invalid[field], `${field} should be validated`)
    }
    for (const field of ['name', 'email', 'message']) {
      assert.ok(oversized[field], `${field} should have a maximum length`)
    }
  })

  it('accepts only unique allowlisted scopes and an allowlisted budget', async () => {
    const duplicateScopes = await validationErrors({ scopes: ['backend-api', 'backend-api'] })
    const emptyScopes = await validationErrors({ scopes: [] })
    const invalidScope = await validationErrors({ scopes: ['backend-api', 'unknown'] })
    const invalidBudget = await validationErrors({ budget: 'unlimited' })

    assert.ok(duplicateScopes.scopes)
    assert.ok(emptyScopes.scopes)
    assert.ok(invalidScope['scopes.1'])
    assert.ok(invalidBudget.budget)
    assert.deepEqual(contactInquiryScopes, [
      'product-design',
      'mobile-app',
      'website-web-app',
      'backend-api',
      'full-product',
      'other',
    ])
    assert.deepEqual(contactInquiryBudgets, [
      'under-500',
      '500-1000',
      '1000-2500',
      '2500-5000',
      'over-5000',
      'not-sure',
    ])
  })

  it('rejects unsupported control characters in contact text', async () => {
    const name = await validationErrors({ name: 'Jordan\u200BSmith' })
    const multilineName = await validationErrors({ name: 'Jordan\nSmith' })
    const message = await validationErrors({
      message: 'A sufficiently long message with a hidden \u202E override.',
    })

    assert.ok(name.name)
    assert.ok(multilineName.name)
    assert.ok(message.message)
  })

  it('accepts every internally consistent lifecycle state', async () => {
    const states = [
      { status: 'new' },
      { status: 'read', readAt },
      { status: 'replied', readAt, repliedAt },
      { status: 'archived', archivedAt },
      { status: 'archived', readAt, archivedAt },
      { status: 'archived', readAt, repliedAt, archivedAt },
    ]

    for (const state of states) {
      await new ContactInquiry(inquiryData(state)).validate()
    }

    assert.deepEqual(contactInquiryStatuses, ['new', 'read', 'replied', 'archived'])
  })

  it('rejects contradictory lifecycle states', async () => {
    const cases = [
      { status: 'new', readAt },
      { status: 'read' },
      { status: 'read', readAt, repliedAt },
      { status: 'replied', repliedAt },
      { status: 'replied', readAt, repliedAt, archivedAt },
      { status: 'archived' },
      { status: 'new', archivedAt },
    ]

    for (const state of cases) {
      await assert.rejects(new ContactInquiry(inquiryData(state)).validate(), {
        name: 'ValidationError',
      })
    }
  })

  it('keeps private content non-selected and defines workflow indexes', () => {
    for (const field of ['email', 'message', 'submissionFingerprint']) {
      assert.equal(ContactInquiry.schema.path(field).options.select, false)
    }
    assert.equal(ContactInquiry.schema.path('submissionFingerprint').options.immutable, true)

    assert.equal(hasIndex(ContactInquiry, { createdAt: -1, _id: -1 }), true)
    assert.equal(hasIndex(ContactInquiry, { status: 1, createdAt: -1, _id: -1 }), true)
    assert.equal(hasIndex(ContactInquiry, { submissionFingerprint: 1, createdAt: -1 }), true)
  })
})
