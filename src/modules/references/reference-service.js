import { createHash, randomBytes } from 'node:crypto'

import createError from 'http-errors'

import { Reference } from './reference.js'

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1_000
const MANAGEMENT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

function defaultCreateManagementToken() {
  return randomBytes(32).toString('base64url')
}

function hashManagementToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function applySelection(query, fields) {
  return typeof query?.select === 'function' ? query.select(fields) : query
}

function clearModerationDecision(reference) {
  reference.moderation.reason = undefined
  reference.moderation.note = undefined
  reference.approvedAt = undefined
  reference.rejectedAt = undefined
}

export function createReferenceService({
  referenceModel = Reference,
  antiSpamService,
  now = () => new Date(),
  createManagementToken = defaultCreateManagementToken,
} = {}) {
  async function findAdminReference(referenceId) {
    const query = referenceModel.findById(referenceId)
    const reference = await applySelection(query, '+normalizedEmail')

    if (!reference) throw createError(404, 'Reference not found')
    return reference
  }

  async function findOwnedReference(referenceId, managementToken) {
    if (!MANAGEMENT_TOKEN_PATTERN.test(managementToken ?? '')) {
      throw createError(404, 'Reference submission not found')
    }

    const reference = await referenceModel.findOne({
      _id: referenceId,
      managementTokenHash: hashManagementToken(managementToken),
    })
    if (!reference) throw createError(404, 'Reference submission not found')
    return reference
  }

  return {
    async submitReference(input, { remoteIp } = {}) {
      const { turnstileToken } = input
      const submission = {
        name: input.name,
        email: input.email,
        company: input.company,
        position: input.position,
        testimonial: input.testimonial,
        ratings: input.ratings,
      }
      if (!antiSpamService) throw createError(503, 'Submission verification is temporarily unavailable')

      await antiSpamService.verifyReferenceSubmission({ token: turnstileToken, remoteIp })

      const duplicateSince = new Date(now().getTime() - DUPLICATE_WINDOW_MS)
      const duplicate = await referenceModel.exists({
        normalizedEmail: submission.email,
        originalTestimonial: submission.testimonial,
        createdAt: { $gte: duplicateSince },
      })
      if (duplicate) throw createError(409, 'This reference was already submitted recently')

      const managementToken = createManagementToken()
      const reference = new referenceModel({
        name: submission.name,
        normalizedEmail: submission.email,
        company: submission.company,
        position: submission.position,
        originalTestimonial: submission.testimonial,
        testimonial: submission.testimonial,
        ratings: submission.ratings,
        status: 'pending',
        managementTokenHash: hashManagementToken(managementToken),
      })
      await reference.save()

      return { reference, managementToken }
    },

    getOwnedReference: findOwnedReference,

    async deleteOwnedReference(referenceId, managementToken) {
      if (!MANAGEMENT_TOKEN_PATTERN.test(managementToken ?? '')) {
        throw createError(404, 'Reference submission not found')
      }

      const reference = await referenceModel.findOneAndDelete({
        _id: referenceId,
        managementTokenHash: hashManagementToken(managementToken),
      })
      if (!reference) throw createError(404, 'Reference submission not found')
    },

    async listAdminReferences({ status, page, limit }) {
      const filter = status ? { status } : {}
      const skip = (page - 1) * limit
      const query = applySelection(referenceModel.find(filter), '+normalizedEmail')
      const itemsQuery = query.sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit)
      const [items, totalItems] = await Promise.all([itemsQuery, referenceModel.countDocuments(filter)])

      return {
        items,
        pagination: {
          page,
          limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
      }
    },

    getAdminReference: findAdminReference,

    async updateReference(referenceId, input) {
      const reference = await findAdminReference(referenceId)

      if (Object.hasOwn(input, 'testimonial') && input.testimonial !== reference.testimonial) {
        reference.testimonial = input.testimonial
        reference.editedAt = now()
      }

      if (Object.hasOwn(input, 'displayOrder')) reference.displayOrder = input.displayOrder

      await reference.save()
      return reference
    },

    async moderateReference(referenceId, input, adminId) {
      const reference = await findAdminReference(referenceId)
      const moderatedAt = now()

      if (input.action === 'approve') {
        if (reference.status === 'approved') return reference

        clearModerationDecision(reference)
        reference.status = 'approved'
        reference.approvedAt = moderatedAt
      } else if (input.action === 'reject') {
        clearModerationDecision(reference)
        reference.status = 'rejected'
        reference.rejectedAt = moderatedAt
        reference.moderation.reason = input.reason
        reference.moderation.note = input.note
      } else {
        if (reference.status === 'pending') return reference

        clearModerationDecision(reference)
        reference.status = 'pending'
      }

      reference.moderation.moderatedBy = adminId
      reference.moderation.moderatedAt = moderatedAt
      await reference.save()
      return reference
    },

    async deleteReference(referenceId) {
      const reference = await referenceModel.findByIdAndDelete(referenceId)
      if (!reference) throw createError(404, 'Reference not found')
    },

    async listPublicReferences({ page, limit }) {
      const filter = { status: 'approved' }
      const skip = (page - 1) * limit
      const fields = '_id name company position testimonial ratings approvedAt'
      const query = referenceModel
        .find(filter)
        .select(fields)
        .sort({ displayOrder: 1, approvedAt: -1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean()
      const [items, totalItems] = await Promise.all([query, referenceModel.countDocuments(filter)])

      return {
        items,
        pagination: {
          page,
          limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
      }
    },
  }
}
