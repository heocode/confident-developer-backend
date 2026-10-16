import { createHash } from 'node:crypto'

import createError from 'http-errors'
import mongoose from 'mongoose'

import { createEmailDeliveryService } from '../email/email-delivery-service.js'
import { EmailDeliveryRetryCommand } from '../email/email-delivery-retry-command.js'
import { ContactInquiry } from './contact-inquiry.js'
import { ContactReply } from './contact-reply.js'
import { createContactReplyService } from './contact-reply-service.js'
import {
  normalizeContactEmail,
  normalizeContactMessage,
  normalizeContactName,
} from './contact-normalization.js'

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1_000

function applySelection(query, selection) {
  return typeof query?.select === 'function' ? query.select(selection) : query
}

function useSession(query, session) {
  return session && typeof query?.session === 'function' ? query.session(session) : query
}

async function runInMongoTransaction(operation) {
  const session = await mongoose.startSession()

  try {
    return await session.withTransaction(() => operation(session))
  } finally {
    await session.endSession()
  }
}

function idOf(document) {
  return document?._id ?? document?.id
}

function idKey(value) {
  const id = value?._id ?? (typeof value?.id === 'string' ? value.id : value)
  return id.toString()
}

export function createContactSubmissionFingerprint({ email, message }) {
  return createHash('sha256')
    .update(`${normalizeContactEmail(email)}\0${normalizeContactMessage(message)}`)
    .digest('hex')
}

export function createContactService({
  inquiryModel = ContactInquiry,
  antiSpamService,
  emailDeliveryService = createEmailDeliveryService(),
  contactReplyService = createContactReplyService({ emailDeliveryService }),
  replyModel = ContactReply,
  retryCommandModel = EmailDeliveryRetryCommand,
  runInTransaction = runInMongoTransaction,
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

  async function createInquiry(input, { session } = {}) {
    const submission = normalizeSubmission(input)
    const inquiry = new inquiryModel({
      ...submission,
      submissionFingerprint: createContactSubmissionFingerprint(submission),
    })

    await inquiry.save({ session })
    return inquiry
  }

  async function findAdminInquiry(inquiryId) {
    const inquiry = await applySelection(inquiryModel.findById(inquiryId), '+email +message')
    if (!inquiry) throw createError(404, 'Contact inquiry not found')
    return inquiry
  }

  async function createAdminInquiryView(inquiry) {
    const [ownerNotification, replies] = await Promise.all([
      emailDeliveryService.getContactOwnerNotification(idOf(inquiry)),
      contactReplyService.listInquiryReplies(idOf(inquiry)),
    ])
    return { inquiry, ownerNotification, replies }
  }

  async function transitionOrFind(inquiryId, filter, update) {
    const inquiry = await applySelection(
      inquiryModel.findOneAndUpdate(
        { _id: inquiryId, ...filter },
        update,
        { returnDocument: 'after', runValidators: true },
      ),
      '+email +message',
    )

    return inquiry ?? findAdminInquiry(inquiryId)
  }

  async function retryDelivery(inquiryId, idempotencyKey, findDelivery, validateSource) {
    const retriedAt = now()
    try {
      return await runInTransaction(async (session) => {
        const inquiry = await useSession(inquiryModel.findById(inquiryId), session)
        if (!inquiry) throw createError(404, 'Contact inquiry not found')
        if (inquiry.status === 'archived') {
          throw createError(409, 'Archived contact inquiry must be restored before retrying email')
        }

        if (validateSource) await validateSource(session)
        const delivery = await findDelivery(session)
        if (!delivery) throw createError(404, 'Email delivery not found')

        const fingerprint = createHash('sha256')
          .update(`${idOf(delivery)}\0${idempotencyKey}`)
          .digest('hex')
        const replay = await useSession(
          retryCommandModel.findOne({ commandFingerprint: fingerprint }),
          session,
        )
        if (replay) return delivery
        if (delivery.status !== 'failed') throw createError(409, 'Only failed email delivery can be retried')
        if (delivery.lastFailureCode === 'source-missing') {
          throw createError(409, 'Email delivery source is no longer available')
        }

        const command = new retryCommandModel({
          deliveryId: idOf(delivery),
          commandFingerprint: fingerprint,
        })
        await command.save({ session })
        const requeued = await emailDeliveryService.requeueFailedDelivery(
          idOf(delivery),
          retriedAt,
          { session },
        )
        if (!requeued) throw createError(409, 'Email delivery state changed before retry')
        return requeued
      })
    } catch (error) {
      if (error?.code !== 11_000) throw error
      const delivery = await findDelivery()
      if (delivery) return delivery
      throw error
    }
  }

  return {
    createInquiry,

    async submitInquiry(input, { remoteIp } = {}) {
      if (!antiSpamService) throw createError(503, 'Submission verification is temporarily unavailable')

      await antiSpamService.verifyContactSubmission({ token: input.turnstileToken, remoteIp })

      const submission = normalizeSubmission(input)
      const submissionFingerprint = createContactSubmissionFingerprint(submission)
      const submittedAt = now()
      const duplicateSince = new Date(submittedAt.getTime() - DUPLICATE_WINDOW_MS)

      return runInTransaction(async (session) => {
        const duplicate = await useSession(
          inquiryModel.exists({
            submissionFingerprint,
            createdAt: { $gte: duplicateSince },
          }),
          session,
        )

        if (duplicate) throw createError(409, 'This inquiry was already submitted recently')

        const inquiry = await createInquiry(submission, { session })
        await emailDeliveryService.createContactOwnerNotification(idOf(inquiry), {
          session,
          nextAttemptAt: submittedAt,
        })
        return inquiry
      })
    },

    async listAdminInquiries({ status, page, limit }) {
      const filter = status ? { status } : {}
      const skip = (page - 1) * limit
      const itemsQuery = inquiryModel
        .find(filter)
        .select('+email')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
      const [inquiries, totalItems] = await Promise.all([
        itemsQuery,
        inquiryModel.countDocuments(filter),
      ])
      const deliveries = await emailDeliveryService.listContactOwnerNotifications(
        inquiries.map(idOf),
      )
      const deliveryBySourceId = new Map(
        deliveries.map((delivery) => [idKey(delivery.sourceId), delivery]),
      )
      const items = inquiries.map((inquiry) => ({
        inquiry,
        ownerNotification: deliveryBySourceId.get(idKey(inquiry)) ?? null,
      }))

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

    async getAdminInquiry(inquiryId) {
      return createAdminInquiryView(await findAdminInquiry(inquiryId))
    },

    queueAdminReply(inquiryId, input, idempotencyKey) {
      return contactReplyService.queueReply(inquiryId, input, idempotencyKey)
    },

    retryOwnerNotification(inquiryId, idempotencyKey) {
      return retryDelivery(
        inquiryId,
        idempotencyKey,
        (session) => emailDeliveryService.getContactOwnerNotification(inquiryId, { session }),
      )
    },

    retryAdminReply(inquiryId, replyId, idempotencyKey) {
      return retryDelivery(
        inquiryId,
        idempotencyKey,
        (session) => emailDeliveryService.getContactAdminReplyDelivery(replyId, { session }),
        async (session) => {
          const reply = await useSession(replyModel.findOne({ _id: replyId, inquiryId }), session)
          if (!reply) throw createError(404, 'Contact reply not found')
        },
      )
    },

    async markInquiryRead(inquiryId) {
      const readAt = now()
      const inquiry = await transitionOrFind(
        inquiryId,
        { status: 'new' },
        { $set: { status: 'read', readAt } },
      )
      return createAdminInquiryView(inquiry)
    },

    async archiveInquiry(inquiryId) {
      const archivedAt = now()
      const inquiry = await transitionOrFind(
        inquiryId,
        { status: { $ne: 'archived' } },
        { $set: { status: 'archived', archivedAt } },
      )
      return createAdminInquiryView(inquiry)
    },

    async restoreInquiry(inquiryId) {
      const current = await findAdminInquiry(inquiryId)
      if (current.status !== 'archived') return createAdminInquiryView(current)

      const restoredStatus = current.repliedAt ? 'replied' : current.readAt ? 'read' : 'new'
      const restored = await applySelection(
        inquiryModel.findOneAndUpdate(
          { _id: inquiryId, status: 'archived' },
          { $set: { status: restoredStatus }, $unset: { archivedAt: 1 } },
          { returnDocument: 'after', runValidators: true },
        ),
        '+email +message',
      )

      return createAdminInquiryView(restored ?? (await findAdminInquiry(inquiryId)))
    },

    async deleteArchivedInquiry(inquiryId) {
      return runInTransaction(async (session) => {
        const inquiry = await useSession(
          inquiryModel.findOneAndDelete({
            _id: inquiryId,
            status: 'archived',
          }),
          session,
        )
        if (inquiry) {
          await contactReplyService.deleteInquiryReplies(idOf(inquiry), { session })
          await emailDeliveryService.deleteContactDeliveries(idOf(inquiry), { session })
          return
        }

        const existingInquiry = await useSession(inquiryModel.findById(inquiryId), session)
        if (!existingInquiry) throw createError(404, 'Contact inquiry not found')
        throw createError(409, 'Contact inquiry must be archived before deletion')
      })
    },
  }
}
