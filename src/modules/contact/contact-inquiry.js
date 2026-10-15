import mongoose from 'mongoose'

import {
  contactInquiryBudgets,
  contactInquiryScopes,
  contactInquiryStatuses,
} from './contact-inquiry-values.js'

const unsafeCharactersPattern = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u

function containsOnlySupportedCharacters(value) {
  return !unsafeCharactersPattern.test(value)
}

function containsOnlySupportedSingleLineCharacters(value) {
  return containsOnlySupportedCharacters(value) && !/[\r\n]/u.test(value)
}

function hasUniqueValues(values) {
  return new Set(values).size === values.length
}

function hasDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

const contactInquirySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
      validate: {
        validator: containsOnlySupportedSingleLineCharacters,
        message: 'Name contains unsupported characters',
      },
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      select: false,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      minlength: 20,
      maxlength: 5_000,
      select: false,
      validate: {
        validator: containsOnlySupportedCharacters,
        message: 'Message contains unsupported characters',
      },
    },
    scopes: {
      type: [{ type: String, enum: contactInquiryScopes }],
      required: true,
      validate: [
        {
          validator: (values) => values.length >= 1 && values.length <= contactInquiryScopes.length,
          message: `Scopes must contain between 1 and ${contactInquiryScopes.length} values`,
        },
        { validator: hasUniqueValues, message: 'Scopes must not contain duplicates' },
      ],
    },
    budget: { type: String, enum: contactInquiryBudgets, required: true },
    status: { type: String, enum: contactInquiryStatuses, default: 'new', required: true },
    readAt: { type: Date },
    repliedAt: { type: Date },
    archivedAt: { type: Date },
    submissionFingerprint: {
      type: String,
      required: true,
      immutable: true,
      select: false,
      minlength: 64,
      maxlength: 64,
      match: /^[a-f\d]{64}$/,
    },
  },
  {
    collection: 'contact_inquiries',
    timestamps: true,
    versionKey: false,
  },
)

contactInquirySchema.pre('validate', function validateLifecycleState() {
  const isRead = hasDate(this.readAt)
  const isReplied = hasDate(this.repliedAt)
  const isArchived = hasDate(this.archivedAt)

  if (isReplied && !isRead) {
    this.invalidate('readAt', 'Read date is required when a reply date exists')
  }

  if (this.status === 'new' && (isRead || isReplied || isArchived)) {
    this.invalidate('status', 'New inquiries cannot have lifecycle dates')
  }

  if (this.status === 'read') {
    if (!isRead) this.invalidate('readAt', 'Read date is required for read inquiries')
    if (isReplied) this.invalidate('repliedAt', 'Read inquiries cannot have a reply date')
    if (isArchived) this.invalidate('archivedAt', 'Read inquiries cannot have an archive date')
  }

  if (this.status === 'replied') {
    if (!isRead) this.invalidate('readAt', 'Read date is required for replied inquiries')
    if (!isReplied) this.invalidate('repliedAt', 'Reply date is required for replied inquiries')
    if (isArchived) this.invalidate('archivedAt', 'Replied inquiries cannot have an archive date')
  }

  if (this.status === 'archived' && !isArchived) {
    this.invalidate('archivedAt', 'Archive date is required for archived inquiries')
  }

  if (this.status !== 'archived' && isArchived) {
    this.invalidate('archivedAt', 'Archive date is allowed only for archived inquiries')
  }
})

contactInquirySchema.index({ createdAt: -1, _id: -1 })
contactInquirySchema.index({ status: 1, createdAt: -1, _id: -1 })
contactInquirySchema.index({ submissionFingerprint: 1, createdAt: -1 })

export const ContactInquiry = mongoose.model('ContactInquiry', contactInquirySchema)
