import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import mongoose from 'mongoose'

import { Reference } from '../../../src/modules/references/reference.js'
import { createReferenceService } from '../../../src/modules/references/reference-service.js'

const referenceId = '68e7d0000000000000000001'
const adminId = '68e7d0000000000000000002'
const now = new Date('2026-10-14T15:00:00.000Z')

function referenceDocument(overrides = {}) {
  const reference = new Reference({
    _id: new mongoose.Types.ObjectId(referenceId),
    name: 'James Smith',
    normalizedEmail: 'james@example.com',
    company: 'SuperSauced',
    position: 'Founder',
    originalTestimonial: 'Vadim turns ideas into reliable products.',
    testimonial: 'Vadim turns ideas into reliable products.',
    ratings: { overall: 5, technical: 5, communication: 5 },
    ...overrides,
  })
  reference.save = async () => {
    await reference.validate()
    return reference
  }
  return reference
}

function selectedResult(value) {
  return {
    select() {
      return this
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject)
    },
  }
}

function createServiceHarness(existingReference = null) {
  const state = { deleted: [], findFilters: [], countFilters: [], query: {} }
  const referenceModel = {
    findById() {
      return selectedResult(existingReference)
    },
    findByIdAndDelete: async (id) => {
      state.deleted.push(id)
      return existingReference
    },
    find(filter) {
      state.findFilters.push(filter)
      const query = {
        select(fields) {
          state.query.select = fields
          return this
        },
        sort(specification) {
          state.query.sort = specification
          return this
        },
        skip(value) {
          state.query.skip = value
          return this
        },
        limit(value) {
          state.query.limit = value
          return this
        },
        lean() {
          state.query.lean = true
          return Promise.resolve(existingReference ? [existingReference.toObject()] : [])
        },
        then(resolve, reject) {
          return Promise.resolve(existingReference ? [existingReference] : []).then(resolve, reject)
        },
      }
      return query
    },
    async countDocuments(filter) {
      state.countFilters.push(filter)
      return existingReference ? 1 : 0
    },
  }

  return {
    service: createReferenceService({ referenceModel, now: () => now }),
    state,
  }
}

function submissionInput(overrides = {}) {
  return {
    name: 'James Smith',
    email: 'james@example.com',
    company: 'SuperSauced',
    position: 'Founder',
    testimonial: 'Vadim turns ideas into reliable products.',
    ratings: { overall: 5, technical: 5, communication: 5 },
    turnstileToken: 'verified-turnstile-token',
    website: '',
    ...overrides,
  }
}

function createSubmissionHarness({ duplicate = false, ownedReference = null } = {}) {
  const state = {
    saved: [],
    existsFilters: [],
    ownershipFilters: [],
    deletedOwnershipFilters: [],
    verificationCalls: [],
  }

  function ReferenceModel(values) {
    const reference = new Reference({
      _id: new mongoose.Types.ObjectId(referenceId),
      createdAt: now,
      updatedAt: now,
      ...values,
    })
    reference.save = async () => {
      await reference.validate()
      state.saved.push(reference)
      return reference
    }
    return reference
  }

  ReferenceModel.exists = async (filter) => {
    state.existsFilters.push(filter)
    return duplicate ? { _id: referenceId } : null
  }
  ReferenceModel.findOne = async (filter) => {
    state.ownershipFilters.push(filter)
    return ownedReference
  }
  ReferenceModel.findOneAndDelete = async (filter) => {
    state.deletedOwnershipFilters.push(filter)
    return ownedReference
  }

  const antiSpamService = {
    async verifyReferenceSubmission(input) {
      state.verificationCalls.push(input)
    },
  }
  const managementToken = 'm'.repeat(43)
  const service = createReferenceService({
    referenceModel: ReferenceModel,
    antiSpamService,
    now: () => now,
    createManagementToken: () => managementToken,
  })

  return { service, state, managementToken }
}

describe('Reference service', () => {
  it('verifies and stores every accepted submission as pending with only a token hash', async () => {
    const { service, state, managementToken } = createSubmissionHarness()

    const result = await service.submitReference(submissionInput(), { remoteIp: '203.0.113.10' })

    assert.equal(result.managementToken, managementToken)
    assert.deepEqual(state.verificationCalls, [
      { token: 'verified-turnstile-token', remoteIp: '203.0.113.10' },
    ])
    assert.equal(state.saved.length, 1)
    assert.equal(result.reference.status, 'pending')
    assert.equal(result.reference.originalTestimonial, submissionInput().testimonial)
    assert.equal(result.reference.testimonial, submissionInput().testimonial)
    assert.equal(result.reference.normalizedEmail, 'james@example.com')
    assert.equal(
      result.reference.managementTokenHash,
      createHash('sha256').update(managementToken).digest('hex'),
    )
    assert.equal(result.reference.managementTokenHash.includes(managementToken), false)
    assert.deepEqual(state.existsFilters[0], {
      normalizedEmail: 'james@example.com',
      originalTestimonial: submissionInput().testimonial,
      createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1_000) },
    })
  })

  it('rejects a recent duplicate without creating another document', async () => {
    const { service, state } = createSubmissionHarness({ duplicate: true })

    await assert.rejects(
      service.submitReference(submissionInput()),
      (error) => error.status === 409 && error.message.includes('already submitted'),
    )
    assert.equal(state.saved.length, 0)
  })

  it('retrieves and deletes an owned submission by the management-token hash', async () => {
    const ownedReference = referenceDocument()
    const { service, state, managementToken } = createSubmissionHarness({ ownedReference })
    const expectedHash = createHash('sha256').update(managementToken).digest('hex')

    assert.equal(await service.getOwnedReference(referenceId, managementToken), ownedReference)
    await service.deleteOwnedReference(referenceId, managementToken)

    assert.deepEqual(state.ownershipFilters, [
      { _id: referenceId, managementTokenHash: expectedHash },
    ])
    assert.deepEqual(state.deletedOwnershipFilters, [
      { _id: referenceId, managementTokenHash: expectedHash },
    ])
  })

  it('hides malformed and unknown ownership credentials behind the same 404', async () => {
    const missing = createSubmissionHarness()

    await assert.rejects(
      missing.service.getOwnedReference(referenceId, 'invalid'),
      (error) => error.status === 404 && error.message === 'Reference submission not found',
    )
    await assert.rejects(
      missing.service.getOwnedReference(referenceId, 'm'.repeat(43)),
      (error) => error.status === 404 && error.message === 'Reference submission not found',
    )
    await assert.rejects(
      missing.service.deleteOwnedReference(referenceId, 'm'.repeat(43)),
      (error) => error.status === 404 && error.message === 'Reference submission not found',
    )
  })

  it('edits the public testimonial while preserving the original', async () => {
    const reference = referenceDocument()
    const { service } = createServiceHarness(reference)

    const updated = await service.updateReference(referenceId, {
      testimonial: 'A corrected testimonial that remains safe for publication.',
      displayOrder: 3,
    })

    assert.equal(updated.originalTestimonial, 'Vadim turns ideas into reliable products.')
    assert.equal(updated.testimonial, 'A corrected testimonial that remains safe for publication.')
    assert.equal(updated.displayOrder, 3)
    assert.equal(updated.editedAt.toISOString(), now.toISOString())
  })

  it('approves, rejects, and reopens a reference with server-owned metadata', async () => {
    const reference = referenceDocument()
    const { service } = createServiceHarness(reference)

    await service.moderateReference(referenceId, { action: 'approve' }, adminId)
    assert.equal(reference.status, 'approved')
    assert.equal(reference.approvedAt.toISOString(), now.toISOString())
    assert.equal(reference.moderation.moderatedBy.toString(), adminId)

    await service.moderateReference(
      referenceId,
      { action: 'reject', reason: 'spam', note: 'Repeated promotion' },
      adminId,
    )
    assert.equal(reference.status, 'rejected')
    assert.equal(reference.approvedAt, undefined)
    assert.equal(reference.moderation.reason, 'spam')

    await service.moderateReference(referenceId, { action: 'reopen' }, adminId)
    assert.equal(reference.status, 'pending')
    assert.equal(reference.rejectedAt, undefined)
    assert.equal(reference.moderation.reason, undefined)
  })

  it('filters public reads to approved references with deterministic pagination', async () => {
    const reference = referenceDocument()
    const { service, state } = createServiceHarness(reference)

    const result = await service.listPublicReferences({ page: 2, limit: 5 })

    assert.deepEqual(state.findFilters.at(-1), { status: 'approved' })
    assert.deepEqual(state.query.sort, { displayOrder: 1, approvedAt: -1, _id: 1 })
    assert.equal(state.query.skip, 5)
    assert.equal(state.query.limit, 5)
    assert.equal(state.query.select.includes('normalizedEmail'), false)
    assert.equal(state.query.lean, true)
    assert.deepEqual(result.pagination, { page: 2, limit: 5, totalItems: 1, totalPages: 1 })
  })

  it('filters and paginates the admin moderation queue', async () => {
    const reference = referenceDocument()
    const { service, state } = createServiceHarness(reference)

    const result = await service.listAdminReferences({ status: 'pending', page: 2, limit: 20 })

    assert.deepEqual(state.findFilters.at(-1), { status: 'pending' })
    assert.deepEqual(state.query.sort, { createdAt: -1, _id: -1 })
    assert.equal(state.query.skip, 20)
    assert.equal(state.query.limit, 20)
    assert.equal(state.query.select, '+normalizedEmail')
    assert.deepEqual(result.pagination, { page: 2, limit: 20, totalItems: 1, totalPages: 1 })
  })

  it('returns not-found errors for missing administrative records', async () => {
    const { service } = createServiceHarness()

    await assert.rejects(service.getAdminReference(referenceId), (error) => error.status === 404)
    await assert.rejects(
      service.updateReference(referenceId, { displayOrder: 1 }),
      (error) => error.status === 404,
    )
    await assert.rejects(
      service.moderateReference(referenceId, { action: 'approve' }, adminId),
      (error) => error.status === 404,
    )
    await assert.rejects(service.deleteReference(referenceId), (error) => error.status === 404)
  })
})
