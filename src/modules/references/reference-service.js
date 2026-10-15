import createError from 'http-errors'

import { Reference } from './reference.js'

function applySelection(query, fields) {
  return typeof query?.select === 'function' ? query.select(fields) : query
}

function clearModerationDecision(reference) {
  reference.moderation.reason = undefined
  reference.moderation.note = undefined
  reference.approvedAt = undefined
  reference.rejectedAt = undefined
}

export function createReferenceService({ referenceModel = Reference, now = () => new Date() } = {}) {
  async function findAdminReference(referenceId) {
    const query = referenceModel.findById(referenceId)
    const reference = await applySelection(query, '+normalizedEmail')

    if (!reference) throw createError(404, 'Reference not found')
    return reference
  }

  return {
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
