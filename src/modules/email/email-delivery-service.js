import { EmailDelivery } from './email-delivery.js'
import {
  contactAdminReplyKind,
  contactOwnerNotificationKind,
  emailDeliveryKinds,
} from './email-delivery-values.js'
const DEFAULT_LEASE_MS = 30_000

function useSession(query, session) {
  return session && typeof query?.session === 'function' ? query.session(session) : query
}

export function createEmailDeliveryService({
  deliveryModel = EmailDelivery,
  now = () => new Date(),
} = {}) {
  return {
    async createContactOwnerNotification(sourceId, { session, nextAttemptAt = now() } = {}) {
      const delivery = new deliveryModel({
        kind: contactOwnerNotificationKind,
        sourceId,
        status: 'pending',
        attemptCount: 0,
        nextAttemptAt,
      })

      await delivery.save({ session })
      return delivery
    },

    async createContactAdminReply(sourceId, { session, nextAttemptAt = now() } = {}) {
      const delivery = new deliveryModel({
        kind: contactAdminReplyKind,
        sourceId,
        status: 'pending',
        attemptCount: 0,
        nextAttemptAt,
      })

      await delivery.save({ session })
      return delivery
    },

    async listContactOwnerNotifications(sourceIds, { session } = {}) {
      if (sourceIds.length === 0) return []

      return useSession(
        deliveryModel.find({
          kind: contactOwnerNotificationKind,
          sourceId: { $in: sourceIds },
        }),
        session,
      )
    },

    async getContactOwnerNotification(sourceId, { session } = {}) {
      return useSession(
        deliveryModel.findOne({ kind: contactOwnerNotificationKind, sourceId }),
        session,
      )
    },

    async listContactAdminReplyDeliveries(sourceIds, { session } = {}) {
      if (sourceIds.length === 0) return []

      return useSession(
        deliveryModel.find({
          kind: contactAdminReplyKind,
          sourceId: { $in: sourceIds },
        }),
        session,
      )
    },

    async deleteContactDeliveries(sourceId, { session } = {}) {
      return deliveryModel.deleteMany(
        { kind: contactOwnerNotificationKind, sourceId },
        { session },
      )
    },

    async deleteContactReplyDeliveries(sourceIds, { session } = {}) {
      if (sourceIds.length === 0) return
      return deliveryModel.deleteMany(
        { kind: contactAdminReplyKind, sourceId: { $in: sourceIds } },
        { session },
      )
    },

    async claimNextDelivery({ leaseMs = DEFAULT_LEASE_MS } = {}) {
      const claimedAt = now()
      const leaseUntil = new Date(claimedAt.getTime() + leaseMs)

      return deliveryModel.findOneAndUpdate(
        {
          kind: { $in: emailDeliveryKinds },
          $or: [
            { status: 'pending', nextAttemptAt: { $lte: claimedAt } },
            { status: 'processing', leaseUntil: { $lte: claimedAt } },
          ],
        },
        {
          $set: {
            status: 'processing',
            lastAttemptAt: claimedAt,
            leaseUntil,
          },
          $inc: { attemptCount: 1 },
          $unset: {
            nextAttemptAt: 1,
            acceptedAt: 1,
            failedAt: 1,
            providerMessageId: 1,
          },
        },
        {
          sort: { createdAt: 1, _id: 1 },
          returnDocument: 'after',
        },
      )
    },

    async markDeliveryAccepted(
      deliveryId,
      attemptCount,
      providerMessageId,
      { session, acceptedAt = now() } = {},
    ) {
      return useSession(deliveryModel.findOneAndUpdate(
        { _id: deliveryId, status: 'processing', attemptCount },
        {
          $set: {
            status: 'accepted',
            acceptedAt,
            providerMessageId,
          },
          $unset: {
            leaseUntil: 1,
            nextAttemptAt: 1,
            failedAt: 1,
            lastFailureCode: 1,
          },
        },
        { returnDocument: 'after' },
      ), session)
    },

    async rescheduleDelivery(deliveryId, attemptCount, failureCode, nextAttemptAt) {
      return deliveryModel.findOneAndUpdate(
        { _id: deliveryId, status: 'processing', attemptCount },
        {
          $set: {
            status: 'pending',
            nextAttemptAt,
            lastFailureCode: failureCode,
          },
          $unset: {
            leaseUntil: 1,
            acceptedAt: 1,
            failedAt: 1,
            providerMessageId: 1,
          },
        },
        { returnDocument: 'after' },
      )
    },

    async markDeliveryFailed(deliveryId, attemptCount, failureCode) {
      return deliveryModel.findOneAndUpdate(
        { _id: deliveryId, status: 'processing', attemptCount },
        {
          $set: {
            status: 'failed',
            failedAt: now(),
            lastFailureCode: failureCode,
          },
          $unset: {
            leaseUntil: 1,
            nextAttemptAt: 1,
            acceptedAt: 1,
            providerMessageId: 1,
          },
        },
        { returnDocument: 'after' },
      )
    },
  }
}
