import mongoose from 'mongoose'

export const projectStatuses = Object.freeze(['draft', 'published', 'archived'])
export const projectLinkTypes = Object.freeze(['mobile', 'backend', 'website', 'appStore', 'github', 'other'])

const integerValidation = {
  validator: Number.isInteger,
  message: '{PATH} must be an integer',
}

const buildBreakdownSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 120 },
    percentage: { type: Number, required: true, min: 0, max: 100, validate: integerValidation },
  },
  { _id: false },
)

const projectLinkSchema = new mongoose.Schema(
  {
    type: { type: String, enum: projectLinkTypes, required: true },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2_048,
      validate: {
        validator(value) {
          try {
            return new URL(value).protocol === 'https:'
          } catch {
            return false
          }
        },
        message: 'Project link must use HTTPS',
      },
    },
  },
  { _id: false },
)

const projectScreenshotSchema = new mongoose.Schema(
  {
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', required: true },
    alt: { type: String, required: true, trim: true, maxlength: 300 },
    order: { type: Number, required: true, min: 0, max: 999, default: 0, validate: integerValidation },
  },
  { _id: false },
)

const timelineSchema = new mongoose.Schema(
  {
    startDate: { type: Date },
    endDate: { type: Date, default: null },
  },
  { _id: false },
)

const homePlacementSchema = new mongoose.Schema(
  {
    featured: { type: Boolean, default: false },
    primary: { type: Boolean, default: false },
    order: { type: Number, min: 0, max: 999, default: 0, validate: integerValidation },
  },
  { _id: false },
)

const portfolioProjectSchema = new mongoose.Schema(
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
    tagline: { type: String, trim: true, maxlength: 240 },
    summary: { type: String, trim: true, maxlength: 1_500 },
    scope: { type: String, trim: true, maxlength: 5_000 },
    position: { type: String, trim: true, maxlength: 160 },
    themeColor: {
      type: String,
      trim: true,
      uppercase: true,
      match: /^#[0-9A-F]{6}$/,
    },
    status: { type: String, enum: projectStatuses, default: 'draft', required: true },
    timeline: { type: timelineSchema, default: undefined },
    home: { type: homePlacementSchema, default: () => ({}) },
    projectsPageOrder: { type: Number, min: 0, max: 999, default: 0, validate: integerValidation },
    buildBreakdown: {
      type: [buildBreakdownSchema],
      default: [],
      validate: {
        validator(items) {
          return items.length <= 12
        },
        message: 'Build breakdown cannot contain more than 12 items',
      },
    },
    links: {
      type: [projectLinkSchema],
      default: [],
      validate: {
        validator(items) {
          return items.length <= 10
        },
        message: 'Project cannot contain more than 10 links',
      },
    },
    logoAsset: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset' },
    homePreviewAsset: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset' },
    screenshots: {
      type: [projectScreenshotSchema],
      default: [],
      validate: {
        validator(items) {
          return items.length <= 12
        },
        message: 'Project cannot contain more than 12 screenshots',
      },
    },
    publishedAt: { type: Date },
  },
  {
    collection: 'portfolio_projects',
    timestamps: true,
    versionKey: false,
  },
)

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

portfolioProjectSchema.pre('validate', function validateProjectState() {
  if (this.home?.primary && !this.home.featured) {
    this.invalidate('home.primary', 'Primary projects must also be featured')
  }

  if (this.timeline?.startDate && this.timeline?.endDate && this.timeline.endDate < this.timeline.startDate) {
    this.invalidate('timeline.endDate', 'Timeline end date cannot be earlier than its start date')
  }

  if (this.status !== 'published') return

  const requiredTextFields = ['scope', 'position', 'themeColor']

  for (const field of requiredTextFields) {
    if (!hasText(this[field])) this.invalidate(field, `${field} is required for published projects`)
  }

  if (!this.timeline?.startDate) {
    this.invalidate('timeline.startDate', 'Timeline start date is required for published projects')
  }

  if (!this.logoAsset) this.invalidate('logoAsset', 'Logo is required for published projects')
  if (this.screenshots.length === 0) {
    this.invalidate('screenshots', 'At least one screenshot is required for published projects')
  }
  if (!this.publishedAt) this.invalidate('publishedAt', 'Publication date is required for published projects')

  if (!this.home.featured) return

  for (const field of ['tagline', 'summary']) {
    if (!hasText(this[field])) this.invalidate(field, `${field} is required for featured projects`)
  }
  if (!this.homePreviewAsset) {
    this.invalidate('homePreviewAsset', 'Home preview is required for featured projects')
  }
  if (this.buildBreakdown.length === 0) {
    this.invalidate('buildBreakdown', 'Build breakdown is required for featured projects')
  }
})

portfolioProjectSchema.index({ slug: 1 }, { unique: true })
portfolioProjectSchema.index({ status: 1, projectsPageOrder: 1, _id: 1 })
portfolioProjectSchema.index({ status: 1, 'home.featured': 1, 'home.order': 1, _id: 1 })
portfolioProjectSchema.index(
  { 'home.primary': 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'published', 'home.primary': true },
  },
)

export const PortfolioProject = mongoose.model('PortfolioProject', portfolioProjectSchema)
