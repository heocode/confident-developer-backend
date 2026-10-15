import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { Reference } from '../../../src/modules/references/reference.js'
import {
  ReferenceSectionSettings,
} from '../../../src/modules/references/reference-section-settings.js'

function hasIndex(model, fields, expectedOptions = {}) {
  return model.schema.indexes().some(([indexFields, options]) => {
    const fieldsMatch = JSON.stringify(indexFields) === JSON.stringify(fields)
    const optionsMatch = Object.entries(expectedOptions).every(
      ([key, value]) => JSON.stringify(options[key]) === JSON.stringify(value),
    )
    return fieldsMatch && optionsMatch
  })
}

function referenceData(overrides = {}) {
  return {
    name: 'James Smith',
    normalizedEmail: 'james@example.com',
    company: 'SuperSauced',
    position: 'Founder',
    originalTestimonial: 'Vadim turns ideas into reliable products.',
    testimonial: 'Vadim turns ideas into reliable products.',
    ratings: { overall: 5, technical: 5, communication: 5 },
    ...overrides,
  }
}

describe('Reference model', () => {
  it('stores pending submissions in an isolated production collection', async () => {
    const reference = new Reference(referenceData())

    await reference.validate()

    assert.equal(Reference.collection.collectionName, 'portfolio_references')
    assert.equal(reference.status, 'pending')
    assert.equal(reference.displayOrder, 0)
  })

  it('requires bounded integer ratings', async () => {
    const reference = new Reference(
      referenceData({ ratings: { overall: 0, technical: 4.5, communication: 6 } }),
    )

    await assert.rejects(reference.validate(), (error) => {
      assert.ok(error.errors['ratings.overall'])
      assert.ok(error.errors['ratings.technical'])
      assert.ok(error.errors['ratings.communication'])
      return true
    })
  })

  it('requires server-owned moderation metadata for terminal states', async () => {
    const approved = new Reference(referenceData({ status: 'approved' }))
    const rejected = new Reference(
      referenceData({
        status: 'rejected',
        rejectedAt: '2026-10-14T12:00:00.000Z',
        moderation: { reason: 'other', moderatedAt: '2026-10-14T12:00:00.000Z' },
      }),
    )

    await assert.rejects(approved.validate(), (error) => {
      assert.ok(error.errors.approvedAt)
      assert.ok(error.errors['moderation.moderatedAt'])
      return true
    })
    await assert.rejects(rejected.validate(), (error) => {
      assert.ok(error.errors['moderation.note'])
      return true
    })
  })

  it('defines deterministic public, admin, email, and ownership indexes', () => {
    assert.equal(
      hasIndex(Reference, { status: 1, displayOrder: 1, approvedAt: -1, _id: 1 }),
      true,
    )
    assert.equal(hasIndex(Reference, { status: 1, createdAt: -1, _id: -1 }), true)
    assert.equal(hasIndex(Reference, { normalizedEmail: 1, createdAt: -1 }), true)
    assert.equal(hasIndex(Reference, { managementTokenHash: 1 }, { unique: true, sparse: true }), true)
  })
})

describe('ReferenceSectionSettings model', () => {
  it('stores one bounded Home empty-state message', async () => {
    const settings = new ReferenceSectionSettings({
      key: 'home',
      emptyStateMessage: 'It feels empty, but that is only for now!',
      messageUpdatedAt: new Date('2026-10-15T12:00:00.000Z'),
    })

    await settings.validate()

    assert.equal(ReferenceSectionSettings.collection.collectionName, 'reference_section_settings')
    assert.equal(hasIndex(ReferenceSectionSettings, { key: 1 }, { unique: true }), true)
  })

  it('rejects an unsupported singleton key and oversized message', async () => {
    const settings = new ReferenceSectionSettings({
      key: 'archive',
      emptyStateMessage: 'x'.repeat(301),
      messageUpdatedAt: new Date(),
    })

    await assert.rejects(settings.validate(), (error) => {
      assert.ok(error.errors.key)
      assert.ok(error.errors.emptyStateMessage)
      return true
    })
  })
})
