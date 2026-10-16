import mongoose from 'mongoose'

import { EmailDeliveryEvent } from './email-delivery-event.js'
import { createEmailDeliveryService } from './email-delivery-service.js'
import {
  contactAdminReplyKind,
  resendDeliveryEventTypes,
} from './email-delivery-values.js'

const EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000
const outcomeByType = Object.freeze({
  'email.delivery_delayed': { status: 'delayed', dateField: 'delayedAt', rank: 1 },
  'email.delivered': { status: 'delivered', dateField: 'deliveredAt', rank: 2 },
  'email.bounced': { status: 'bounced', dateField: 'bouncedAt', rank: 3 },
  'email.complained': { status: 'complained', dateField: 'complainedAt', rank: 4 },
})
const outcomeRanks = Object.freeze({ unknown: 0, delayed: 1, delivered: 2, bounced: 3, complained: 4 })

async function runInMongoTransaction(operation) {
  const session = await mongoose.startSession()
  try {
    return await session.withTransaction(() => operation(session))
  } finally {
    await session.endSession()
  }
}

function deliveryTag(data) {
  if (typeof data?.tags?.delivery_id === 'string') return data.tags.delivery_id
  if (!Array.isArray(data?.tags)) return null
  return data.tags.find((tag) => tag?.name === 'delivery_id')?.value ?? null
}

function validDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function createEmailDeliveryEventService({
  eventModel = EmailDeliveryEvent,
  deliveryService = createEmailDeliveryService(),
  contactReplyService,
  runInTransaction = runInMongoTransaction,
  now = () => new Date(),
} = {}) {
  return {
    async processProviderEvent(providerEventId, event) {
      if (!resendDeliveryEventTypes.includes(event?.type)) return { ignored: true }
      const occurredAt = validDate(event.created_at)
      const providerMessageId = event?.data?.email_id
      if (!occurredAt || typeof providerMessageId !== 'string' || !providerMessageId) {
        return { ignored: true }
      }

      try {
        return await runInTransaction(async (session) => {
          if (await eventModel.exists({ providerEventId }).session(session)) {
            return { duplicate: true }
          }

          const taggedId = deliveryTag(event.data)
          let delivery = mongoose.isValidObjectId(taggedId)
            ? await deliveryService.findById(taggedId, { session, includeProviderMessageId: true })
            : null
          if (!delivery) {
            delivery = await deliveryService.findByProviderMessageId(providerMessageId, { session })
          }
          if (!delivery) return { ignored: true }
          if (delivery.providerMessageId && delivery.providerMessageId !== providerMessageId) {
            return { ignored: true }
          }

          if (delivery.status !== 'accepted') {
            const reconciled = await deliveryService.reconcileDeliveryAccepted(
              delivery._id,
              providerMessageId,
              { session, acceptedAt: occurredAt },
            )
            if (reconciled) {
              delivery = reconciled
              if (delivery.kind === contactAdminReplyKind) {
                await contactReplyService.recordReplyAcceptance(delivery, occurredAt, { session })
              }
            }
          }

          const outcome = outcomeByType[event.type]
          if (outcome) {
            const update = { [outcome.dateField]: occurredAt }
            if (outcome.rank >= outcomeRanks[delivery.recipientStatus ?? 'unknown']) {
              update.recipientStatus = outcome.status
            }
            if (!delivery.lastProviderEventAt || occurredAt >= delivery.lastProviderEventAt) {
              update.lastProviderEventAt = occurredAt
            }
            await deliveryService.recordRecipientOutcome(delivery._id, update, { session })
          }

          const processedAt = now()
          await new eventModel({
            providerEventId,
            deliveryId: delivery._id,
            type: event.type,
            occurredAt,
            processedAt,
            expiresAt: new Date(processedAt.getTime() + EVENT_RETENTION_MS),
          }).save({ session })

          return { processed: true, deliveryId: delivery._id }
        })
      } catch (error) {
        if (error?.code === 11_000) return { duplicate: true }
        throw error
      }
    },
  }
}
