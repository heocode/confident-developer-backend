import { EmailDelivery } from './email-delivery.js'

const CONTACT_OWNER_NOTIFICATION_KIND = 'contact-owner-notification'

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
        kind: CONTACT_OWNER_NOTIFICATION_KIND,
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
          kind: CONTACT_OWNER_NOTIFICATION_KIND,
          sourceId: { $in: sourceIds },
        }),
        session,
      )
    },

    async getContactOwnerNotification(sourceId, { session } = {}) {
      return useSession(
        deliveryModel.findOne({ kind: CONTACT_OWNER_NOTIFICATION_KIND, sourceId }),
        session,
      )
    },

    async deleteContactDeliveries(sourceId, { session } = {}) {
      return deliveryModel.deleteMany(
        { kind: CONTACT_OWNER_NOTIFICATION_KIND, sourceId },
        { session },
      )
    },
  }
}
