import mongoose from 'mongoose'

import { resendDeliveryEventTypes } from './email-delivery-values.js'

const emailDeliveryEventSchema = new mongoose.Schema(
  {
    providerEventId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      minlength: 1,
      maxlength: 255,
    },
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    type: {
      type: String,
      enum: resendDeliveryEventTypes,
      required: true,
      immutable: true,
    },
    occurredAt: { type: Date, required: true, immutable: true },
    processedAt: { type: Date, required: true, immutable: true },
    expiresAt: { type: Date, required: true, immutable: true },
  },
  {
    collection: 'email_delivery_events',
    versionKey: false,
  },
)

emailDeliveryEventSchema.index({ providerEventId: 1 }, { unique: true })
emailDeliveryEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const EmailDeliveryEvent = mongoose.model('EmailDeliveryEvent', emailDeliveryEventSchema)
