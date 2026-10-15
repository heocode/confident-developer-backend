import mongoose from 'mongoose'

export const referenceStatuses = Object.freeze(['pending', 'approved', 'rejected'])
export const referenceRejectionReasons = Object.freeze([
  'spam',
  'inappropriate_content',
  'off_topic',
  'duplicate',
  'personal_information',
  'identity_concern',
  'misleading_content',
  'other',
])

const integerValidation = {
  validator: Number.isInteger,
  message: '{PATH} must be an integer',
}

const ratingsSchema = new mongoose.Schema(
  {
    overall: { type: Number, required: true, min: 1, max: 5, validate: integerValidation },
    technical: { type: Number, required: true, min: 1, max: 5, validate: integerValidation },
    communication: { type: Number, required: true, min: 1, max: 5, validate: integerValidation },
  },
  { _id: false },
)

const moderationSchema = new mongoose.Schema(
  {
    reason: { type: String, enum: referenceRejectionReasons },
    note: { type: String, trim: true, maxlength: 500 },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
    moderatedAt: { type: Date },
  },
  { _id: false },
)

const referenceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    normalizedEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      select: false,
    },
    company: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    position: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    originalTestimonial: {
      type: String,
      required: true,
      trim: true,
      minlength: 20,
      maxlength: 1_500,
      immutable: true,
    },
    testimonial: { type: String, required: true, trim: true, minlength: 20, maxlength: 1_500 },
    ratings: { type: ratingsSchema, required: true },
    status: { type: String, enum: referenceStatuses, default: 'pending', required: true },
    displayOrder: { type: Number, default: 0, min: 0, max: 999, validate: integerValidation },
    managementTokenHash: {
      type: String,
      select: false,
      minlength: 64,
      maxlength: 64,
      match: /^[a-f\d]{64}$/,
    },
    moderation: { type: moderationSchema, default: () => ({}) },
    editedAt: { type: Date },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
  },
  {
    collection: 'portfolio_references',
    timestamps: true,
    versionKey: false,
  },
)

referenceSchema.pre('validate', function validateModerationState() {
  if (this.status === 'approved') {
    if (!this.approvedAt) this.invalidate('approvedAt', 'Approval date is required for approved references')
    if (!this.moderation?.moderatedAt) {
      this.invalidate('moderation.moderatedAt', 'Moderation date is required for approved references')
    }
  }

  if (this.status === 'rejected') {
    if (!this.rejectedAt) this.invalidate('rejectedAt', 'Rejection date is required for rejected references')
    if (!this.moderation?.reason) {
      this.invalidate('moderation.reason', 'Rejection reason is required for rejected references')
    }
    if (!this.moderation?.moderatedAt) {
      this.invalidate('moderation.moderatedAt', 'Moderation date is required for rejected references')
    }
    if (this.moderation?.reason === 'other' && !this.moderation?.note) {
      this.invalidate('moderation.note', 'Moderation note is required when rejection reason is other')
    }
  }
})

referenceSchema.index({ status: 1, displayOrder: 1, approvedAt: -1, _id: 1 })
referenceSchema.index({ status: 1, createdAt: -1, _id: -1 })
referenceSchema.index({ normalizedEmail: 1, createdAt: -1 })
referenceSchema.index({ managementTokenHash: 1 }, { unique: true, sparse: true })

export const Reference = mongoose.model('PortfolioReference', referenceSchema)
