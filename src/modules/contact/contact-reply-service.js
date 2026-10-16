import { createHash } from 'node:crypto'

import createError from 'http-errors'
import mongoose from 'mongoose'

import { createEmailDeliveryService } from '../email/email-delivery-service.js'
import { ContactInquiry } from './contact-inquiry.js'
import { normalizeContactMessage } from './contact-normalization.js'
import { ContactReply } from './contact-reply.js'

function useSession(query, session) {
  return session && typeof query?.session === 'function' ? query.session(session) : query
}

function applySelection(query, selection) {
  return typeof query?.select === 'function' ? query.select(selection) : query
}

function idOf(document) {
  return document?._id ?? document?.id
}

function idKey(value) {
  return (value?._id ?? value?.id ?? value).toString()
}

async function runInMongoTransaction(operation) {
  const session = await mongoose.startSession()
  try {
    return await session.withTransaction(() => operation(session))
  } finally {
    await session.endSession()
  }
}

function commandFingerprint(inquiryId, idempotencyKey) {
  return createHash('sha256').update(`${inquiryId}\0${idempotencyKey}`).digest('hex')
}

export function createContactReplyService({
  replyModel = ContactReply,
  inquiryModel = ContactInquiry,
  emailDeliveryService = createEmailDeliveryService(),
  runInTransaction = runInMongoTransaction,
  now = () => new Date(),
} = {}) {
  async function recordReplyAcceptance(delivery, acceptedAt, { session } = {}) {
    const reply = await useSession(replyModel.findById(delivery.sourceId), session)
    if (!reply) throw createError(404, 'Contact reply source not found')
    const inquiry = await useSession(inquiryModel.findById(reply.inquiryId), session)
    if (!inquiry) throw createError(404, 'Contact inquiry source not found')

    if (!inquiry.readAt) inquiry.readAt = acceptedAt
    if (!inquiry.repliedAt) inquiry.repliedAt = acceptedAt
    if (inquiry.status !== 'archived') inquiry.status = 'replied'
    await inquiry.save({ session })
    return inquiry
  }

  async function findReplyByFingerprint(fingerprint, { session } = {}) {
    return useSession(
      applySelection(replyModel.findOne({ commandFingerprint: fingerprint }), '+message'),
      session,
    )
  }

  async function buildReplyView(reply, { session } = {}) {
    const [delivery] = await emailDeliveryService.listContactAdminReplyDeliveries(
      [idOf(reply)],
      { session },
    )
    return { reply, delivery: delivery ?? null }
  }

  async function resolveReplay(fingerprint, inquiryId, message) {
    const existing = await findReplyByFingerprint(fingerprint)
    if (!existing) return null
    if (idKey(existing.inquiryId) !== idKey(inquiryId) || existing.message !== message) {
      throw createError(409, 'Idempotency key was already used for another reply')
    }
    return buildReplyView(existing)
  }

  return {
    async queueReply(inquiryId, input, idempotencyKey) {
      const message = normalizeContactMessage(input.message)
      const fingerprint = commandFingerprint(inquiryId, idempotencyKey)
      const existing = await resolveReplay(fingerprint, inquiryId, message)
      if (existing) return existing

      try {
        const reply = await runInTransaction(async (session) => {
          const inquiry = await useSession(inquiryModel.findById(inquiryId), session)
          if (!inquiry) throw createError(404, 'Contact inquiry not found')
          if (inquiry.status === 'archived') {
            throw createError(409, 'Archived contact inquiry must be restored before replying')
          }

          const replay = await findReplyByFingerprint(fingerprint, { session })
          if (replay) {
            if (idKey(replay.inquiryId) !== idKey(inquiryId) || replay.message !== message) {
              throw createError(409, 'Idempotency key was already used for another reply')
            }
            return replay
          }

          const queuedAt = now()
          const createdReply = new replyModel({
            inquiryId,
            message,
            commandFingerprint: fingerprint,
          })
          await createdReply.save({ session })
          await emailDeliveryService.createContactAdminReply(idOf(createdReply), {
            session,
            nextAttemptAt: queuedAt,
          })

          if (inquiry.status === 'new') {
            inquiry.status = 'read'
            inquiry.readAt = queuedAt
            await inquiry.save({ session })
          }

          return createdReply
        })

        return buildReplyView(reply)
      } catch (error) {
        if (error?.code !== 11_000) throw error
        const replay = await resolveReplay(fingerprint, inquiryId, message)
        if (replay) return replay
        throw error
      }
    },

    async listInquiryReplies(inquiryId, { session } = {}) {
      const replies = await useSession(
        applySelection(
          replyModel.find({ inquiryId }).sort({ createdAt: 1, _id: 1 }),
          '+message',
        ),
        session,
      )
      const deliveries = await emailDeliveryService.listContactAdminReplyDeliveries(
        replies.map(idOf),
        { session },
      )
      const deliveryByReplyId = new Map(
        deliveries.map((delivery) => [idKey(delivery.sourceId), delivery]),
      )

      return replies.map((reply) => ({
        reply,
        delivery: deliveryByReplyId.get(idKey(reply)) ?? null,
      }))
    },

    async acceptReplyDelivery(delivery, providerMessageId) {
      const acceptedAt = now()
      return runInTransaction(async (session) => {
        const updatedDelivery = await emailDeliveryService.markDeliveryAccepted(
          idOf(delivery),
          delivery.attemptCount,
          providerMessageId,
          { session, acceptedAt },
        )
        if (!updatedDelivery) return null
        await recordReplyAcceptance(delivery, acceptedAt, { session })
        return updatedDelivery
      })
    },

    async recordReplyAcceptance(delivery, acceptedAt, { session } = {}) {
      return recordReplyAcceptance(delivery, acceptedAt, { session })
    },

    async deleteInquiryReplies(inquiryId, { session } = {}) {
      const replies = await useSession(replyModel.find({ inquiryId }).select('_id'), session)
      await emailDeliveryService.deleteContactReplyDeliveries(replies.map(idOf), { session })
      await replyModel.deleteMany({ inquiryId }, { session })
    },
  }
}
