import mongoose from 'mongoose'

export const serviceStatuses = Object.freeze(['draft', 'published', 'archived'])
export const serviceIcons = Object.freeze([
  'product-ui-ux',
  'mobile-development',
  'web-development',
  'backend-development',
])
export const serviceTones = Object.freeze(['product', 'mobile', 'web', 'backend'])
export const serviceToolKeys = Object.freeze([
  'jitter',
  'rive',
  'figma',
  'react',
  'typescript',
  'expo',
  'nextjs',
  'wordpress',
  'vercel',
  'nestjs',
  'postgresql',
  'prisma',
])

const MAX_CAPABILITIES = 8
const MAX_TOOLS = 6
const MAX_RELATED_PROJECTS = 3
const SHOWCASE_ASSET_COUNT = 5

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

const serviceToolSchema = new mongoose.Schema(
  {
    key: { type: String, enum: serviceToolKeys, required: true },
    label: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  },
  { _id: false },
)

function hasUniqueValues(values, selector = (value) => value.toString()) {
  return new Set(values.map(selector)).size === values.length
}

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
    capabilities: {
      type: [{ type: String, trim: true, minlength: 1, maxlength: 80 }],
      default: [],
      validate: [
        {
          validator(values) {
            return values.length <= MAX_CAPABILITIES
          },
          message: `Capabilities cannot contain more than ${MAX_CAPABILITIES} items`,
        },
        {
          validator(values) {
            return hasUniqueValues(values, (value) => value.toLocaleLowerCase('en-US'))
          },
          message: 'Capabilities cannot contain duplicate values',
        },
      ],
    },
    tools: {
      type: [serviceToolSchema],
      default: [],
      validate: [
        {
          validator(values) {
            return values.length <= MAX_TOOLS
          },
          message: `Tools cannot contain more than ${MAX_TOOLS} items`,
        },
        {
          validator(values) {
            return hasUniqueValues(values, (tool) => tool.key)
          },
          message: 'Tools cannot contain duplicate keys',
        },
      ],
    },
    relatedProjects: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PortfolioProject' }],
      default: [],
      validate: [
        {
          validator(values) {
            return values.length <= MAX_RELATED_PROJECTS
          },
          message: `Related projects cannot contain more than ${MAX_RELATED_PROJECTS} items`,
        },
        {
          validator: hasUniqueValues,
          message: 'Related projects cannot contain duplicate IDs',
        },
      ],
    },
    showcaseAssets: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset' }],
      default: [],
      validate: [
        {
          validator(values) {
            return values.length <= SHOWCASE_ASSET_COUNT
          },
          message: `Showcase cannot contain more than ${SHOWCASE_ASSET_COUNT} assets`,
        },
        {
          validator: hasUniqueValues,
          message: 'Showcase cannot contain duplicate media IDs',
        },
      ],
    },
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

  if (this.capabilities.length === 0) {
    this.invalidate('capabilities', 'At least one capability is required for published services')
  }
  if (this.tools.length === 0) {
    this.invalidate('tools', 'At least one tool is required for published services')
  }
  if (this.relatedProjects.length === 0) {
    this.invalidate('relatedProjects', 'At least one related project is required for published services')
  }
  if (this.showcaseAssets.length !== SHOWCASE_ASSET_COUNT) {
    this.invalidate(
      'showcaseAssets',
      `Published services require exactly ${SHOWCASE_ASSET_COUNT} showcase assets`,
    )
  }

  if (!this.publishedAt) this.invalidate('publishedAt', 'Publication date is required for published services')
})

portfolioServiceSchema.index({ slug: 1 }, { unique: true })
portfolioServiceSchema.index({ status: 1, servicesPageOrder: 1, _id: 1 })
portfolioServiceSchema.index({ status: 1, 'home.featured': 1, 'home.order': 1, _id: 1 })
portfolioServiceSchema.index({ relatedProjects: 1 })
portfolioServiceSchema.index({ showcaseAssets: 1 })

export const PortfolioService = mongoose.model('PortfolioService', portfolioServiceSchema)
