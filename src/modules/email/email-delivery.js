import mongoose from 'mongoose'

import {
  emailDeliveryFailureCodes,
  emailDeliveryKinds,
  emailRecipientStatuses,
  emailDeliveryStatuses,
} from './email-delivery-values.js'

function hasDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

const emailDeliverySchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: emailDeliveryKinds,
      required: true,
      immutable: true,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: emailDeliveryStatuses,
      default: 'pending',
      required: true,
    },
    attemptCount: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'Attempt count must be an integer',
      },
    },
    nextAttemptAt: { type: Date },
    lastAttemptAt: { type: Date },
    leaseUntil: { type: Date },
    acceptedAt: { type: Date },
    failedAt: { type: Date },
    lastFailureCode: { type: String, enum: emailDeliveryFailureCodes },
    recipientStatus: {
      type: String,
      enum: emailRecipientStatuses,
      default: 'unknown',
      required: true,
    },
    delayedAt: { type: Date },
    deliveredAt: { type: Date },
    bouncedAt: { type: Date },
    complainedAt: { type: Date },
    lastProviderEventAt: { type: Date },
    manualRetryCount: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
      validate: { validator: Number.isInteger, message: 'Manual retry count must be an integer' },
    },
    lastManualRetryAt: { type: Date },
    providerMessageId: {
      type: String,
      trim: true,
      minlength: 1,
      maxlength: 255,
      select: false,
    },
  },
  {
    collection: 'email_deliveries',
    timestamps: true,
    versionKey: false,
  },
)

emailDeliverySchema.pre('validate', function validateDeliveryState() {
  const hasNextAttempt = hasDate(this.nextAttemptAt)
  const hasLastAttempt = hasDate(this.lastAttemptAt)
  const hasLease = hasDate(this.leaseUntil)
  const isAccepted = hasDate(this.acceptedAt)
  const isFailed = hasDate(this.failedAt)
  const outcomeDateByStatus = {
    delayed: this.delayedAt,
    delivered: this.deliveredAt,
    bounced: this.bouncedAt,
    complained: this.complainedAt,
  }

  if (this.recipientStatus !== 'unknown' && !hasDate(outcomeDateByStatus[this.recipientStatus])) {
    this.invalidate(this.recipientStatus === 'delayed' ? 'delayedAt' : `${this.recipientStatus}At`,
      `Recipient status ${this.recipientStatus} requires its event date`)
  }
  if (this.manualRetryCount > 0 && !hasDate(this.lastManualRetryAt)) {
    this.invalidate('lastManualRetryAt', 'Manual retries require a retry date')
  }
  if (this.manualRetryCount === 0 && hasDate(this.lastManualRetryAt)) {
    this.invalidate('manualRetryCount', 'A retry date requires a manual retry')
  }

  if (this.status === 'pending') {
    if (!hasNextAttempt) this.invalidate('nextAttemptAt', 'Pending delivery requires a next attempt date')
    if (hasLease) this.invalidate('leaseUntil', 'Pending delivery cannot have a lease')
    if (isAccepted || isFailed) this.invalidate('status', 'Pending delivery cannot have a terminal date')
  }

  if (this.status === 'processing') {
    if (this.attemptCount < 1) this.invalidate('attemptCount', 'Processing delivery requires an attempt')
    if (!hasLastAttempt) this.invalidate('lastAttemptAt', 'Processing delivery requires an attempt date')
    if (!hasLease) this.invalidate('leaseUntil', 'Processing delivery requires a lease')
    if (hasNextAttempt) this.invalidate('nextAttemptAt', 'Processing delivery cannot be scheduled')
    if (isAccepted || isFailed) this.invalidate('status', 'Processing delivery cannot have a terminal date')
  }

  if (this.status === 'accepted') {
    if (this.attemptCount < 1) this.invalidate('attemptCount', 'Accepted delivery requires an attempt')
    if (!hasLastAttempt) this.invalidate('lastAttemptAt', 'Accepted delivery requires an attempt date')
    if (!isAccepted) this.invalidate('acceptedAt', 'Accepted delivery requires an acceptance date')
    if (!this.providerMessageId) {
      this.invalidate('providerMessageId', 'Accepted delivery requires a provider message ID')
    }
    if (hasNextAttempt || hasLease || isFailed || this.lastFailureCode) {
      this.invalidate('status', 'Accepted delivery contains incompatible lifecycle data')
    }
  }

  if (this.status === 'failed') {
    if (this.attemptCount < 1) this.invalidate('attemptCount', 'Failed delivery requires an attempt')
    if (!hasLastAttempt) this.invalidate('lastAttemptAt', 'Failed delivery requires an attempt date')
    if (!isFailed) this.invalidate('failedAt', 'Failed delivery requires a failure date')
    if (!this.lastFailureCode) this.invalidate('lastFailureCode', 'Failed delivery requires a failure code')
    if (hasNextAttempt || hasLease || isAccepted || this.providerMessageId) {
      this.invalidate('status', 'Failed delivery contains incompatible lifecycle data')
    }
  }
})

emailDeliverySchema.index({ kind: 1, sourceId: 1 }, { unique: true })
emailDeliverySchema.index(
  { providerMessageId: 1 },
  { unique: true, sparse: true },
)
emailDeliverySchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1, _id: 1 })
emailDeliverySchema.index({ status: 1, leaseUntil: 1 })

export const EmailDelivery = mongoose.model('EmailDelivery', emailDeliverySchema)
