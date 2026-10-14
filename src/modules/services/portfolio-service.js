import mongoose from 'mongoose'

export const serviceStatuses = Object.freeze(['draft', 'published', 'archived'])
export const serviceIcons = Object.freeze([
  'product-ui-ux',
  'mobile-development',
  'web-development',
  'backend-development',
])
export const serviceTones = Object.freeze(['product', 'mobile', 'web', 'backend'])

const integerValidation = {
  validator: Number.isInteger,
  message: '{PATH} must be an integer',
}

const homePlacementSchema = new mongoose.Schema(
  {
    featured: { type: Boolean, default: false },
    order: { type: Number, min: 0, max: 999, default: 0, validate: integerValidation },
  },
  { _id: false },
)

const portfolioServiceSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 1,
      maxlength: 120,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 1_500 },
    icon: { type: String, enum: serviceIcons },
    tone: { type: String, enum: serviceTones },
    status: { type: String, enum: serviceStatuses, default: 'draft', required: true },
    home: { type: homePlacementSchema, default: () => ({}) },
    servicesPageOrder: { type: Number, min: 0, max: 999, default: 0, validate: integerValidation },
    publishedAt: { type: Date },
  },
  {
    collection: 'portfolio_services',
    timestamps: true,
    versionKey: false,
  },
)

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

portfolioServiceSchema.pre('validate', function validateServicePublication() {
  if (this.status !== 'published') return

  for (const field of ['description', 'icon', 'tone']) {
    if (!hasText(this[field])) this.invalidate(field, `${field} is required for published services`)
  }

  if (!this.publishedAt) this.invalidate('publishedAt', 'Publication date is required for published services')
})

portfolioServiceSchema.index({ slug: 1 }, { unique: true })
portfolioServiceSchema.index({ status: 1, servicesPageOrder: 1, _id: 1 })
portfolioServiceSchema.index({ status: 1, 'home.featured': 1, 'home.order': 1, _id: 1 })

export const PortfolioService = mongoose.model('PortfolioService', portfolioServiceSchema)
