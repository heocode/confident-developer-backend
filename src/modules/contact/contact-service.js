import { createHash } from 'node:crypto'

import createError from 'http-errors'

import { ContactInquiry } from './contact-inquiry.js'

function normalizeSingleLine(value) {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ')
}

function normalizeEmail(value) {
  return value.normalize('NFC').trim().toLowerCase()
}

function normalizeMessage(value) {
  return value.normalize('NFC').replace(/\r\n?/gu, '\n').trim()
}

export function createContactSubmissionFingerprint({ email, message }) {
  return createHash('sha256').update(`${normalizeEmail(email)}\0${normalizeMessage(message)}`).digest('hex')
}

export function createContactService({ inquiryModel = ContactInquiry, now = () => new Date() } = {}) {
  async function findInquiry(inquiryId) {
    const inquiry = await inquiryModel.findById(inquiryId)
    if (!inquiry) throw createError(404, 'Contact inquiry not found')
    return inquiry
  }

  async function transitionOrFind(inquiryId, filter, update) {
    const inquiry = await inquiryModel.findOneAndUpdate(
      { _id: inquiryId, ...filter },
      update,
      { returnDocument: 'after', runValidators: true },
    )

    return inquiry ?? findInquiry(inquiryId)
  }

  return {
    async createInquiry(input) {
      const submission = {
        name: normalizeSingleLine(input.name),
        email: normalizeEmail(input.email),
        message: normalizeMessage(input.message),
        scopes: [...input.scopes],
        budget: input.budget,
      }
      const inquiry = new inquiryModel({
        ...submission,
        submissionFingerprint: createContactSubmissionFingerprint(submission),
      })

      await inquiry.save()
      return inquiry
    },

    async markInquiryRead(inquiryId) {
      const readAt = now()
      return transitionOrFind(
        inquiryId,
        { status: 'new' },
        { $set: { status: 'read', readAt } },
      )
    },

    async archiveInquiry(inquiryId) {
      const archivedAt = now()
      return transitionOrFind(
        inquiryId,
        { status: { $ne: 'archived' } },
        { $set: { status: 'archived', archivedAt } },
      )
    },

    async restoreInquiry(inquiryId) {
      const current = await findInquiry(inquiryId)
      if (current.status !== 'archived') return current

      const restoredStatus = current.repliedAt ? 'replied' : current.readAt ? 'read' : 'new'
      const restored = await inquiryModel.findOneAndUpdate(
        { _id: inquiryId, status: 'archived' },
        { $set: { status: restoredStatus }, $unset: { archivedAt: 1 } },
        { returnDocument: 'after', runValidators: true },
      )

      return restored ?? findInquiry(inquiryId)
    },
  }
}
