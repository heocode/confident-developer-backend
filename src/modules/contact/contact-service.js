import { createHash } from 'node:crypto'

import createError from 'http-errors'

import { ContactInquiry } from './contact-inquiry.js'
import {
  normalizeContactEmail,
  normalizeContactMessage,
  normalizeContactName,
} from './contact-normalization.js'

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1_000

export function createContactSubmissionFingerprint({ email, message }) {
  return createHash('sha256')
    .update(`${normalizeContactEmail(email)}\0${normalizeContactMessage(message)}`)
    .digest('hex')
}

export function createContactService({
  inquiryModel = ContactInquiry,
  antiSpamService,
  now = () => new Date(),
} = {}) {
  function normalizeSubmission(input) {
    return {
      name: normalizeContactName(input.name),
      email: normalizeContactEmail(input.email),
      message: normalizeContactMessage(input.message),
      scopes: [...input.scopes],
      budget: input.budget,
    }
  }

  async function createInquiry(input) {
    const submission = normalizeSubmission(input)
    const inquiry = new inquiryModel({
      ...submission,
      submissionFingerprint: createContactSubmissionFingerprint(submission),
    })

    await inquiry.save()
    return inquiry
  }

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
    createInquiry,

    async submitInquiry(input, { remoteIp } = {}) {
      if (!antiSpamService) throw createError(503, 'Submission verification is temporarily unavailable')

      await antiSpamService.verifyContactSubmission({ token: input.turnstileToken, remoteIp })

      const submission = normalizeSubmission(input)
      const submissionFingerprint = createContactSubmissionFingerprint(submission)
      const duplicateSince = new Date(now().getTime() - DUPLICATE_WINDOW_MS)
      const duplicate = await inquiryModel.exists({
        submissionFingerprint,
        createdAt: { $gte: duplicateSince },
      })

      if (duplicate) throw createError(409, 'This inquiry was already submitted recently')

      return createInquiry(submission)
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
