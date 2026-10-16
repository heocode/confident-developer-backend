import mongoose from 'mongoose'

const emailDeliveryRetryCommandSchema = new mongoose.Schema(
  {
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    commandFingerprint: {
      type: String,
      required: true,
      immutable: true,
      select: false,
      minlength: 64,
      maxlength: 64,
      match: /^[a-f\d]{64}$/,
    },
    expiresAt: {
      type: Date,
      required: true,
      immutable: true,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
    },
  },
  {
    collection: 'email_delivery_retry_commands',
    timestamps: true,
    versionKey: false,
  },
)

emailDeliveryRetryCommandSchema.index({ commandFingerprint: 1 }, { unique: true })
emailDeliveryRetryCommandSchema.index({ deliveryId: 1, createdAt: -1 })
emailDeliveryRetryCommandSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const EmailDeliveryRetryCommand = mongoose.model(
  'EmailDeliveryRetryCommand',
  emailDeliveryRetryCommandSchema,
)
