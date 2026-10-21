import mongoose from 'mongoose'

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_DIMENSION = 10_000
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024
export const MAX_VIDEO_DIMENSION = 1_920
export const MAX_VIDEO_DURATION_SECONDS = 30
export const MAX_ANIMATION_BYTES = 5 * 1024 * 1024
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024

export const MEDIA_ASSET_KINDS = Object.freeze(['image', 'video', 'animation', 'document'])

const POLICIES = Object.freeze({
  image: { formats: new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']), resourceType: 'image' },
  video: { formats: new Set(['mp4']), resourceType: 'video' },
  animation: { formats: new Set(['riv']), resourceType: 'raw' },
  document: { formats: new Set(['pdf']), resourceType: 'image' },
})

const integerValidation = {
  validator: Number.isInteger,
  message: '{PATH} must be an integer',
}

function isSecureUrl(value) {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

const mediaAssetSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ['cloudinary'],
      required: true,
      default: 'cloudinary',
    },
    kind: { type: String, enum: MEDIA_ASSET_KINDS, required: true, default: 'image' },
    providerAssetId: { type: String, required: true, trim: true, maxlength: 255 },
    secureUrl: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2_048,
      validate: { validator: isSecureUrl, message: 'Media URL must use HTTPS' },
    },
    resourceType: {
      type: String,
      enum: ['image', 'video', 'raw'],
      required: true,
      default: 'image',
    },
    format: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 20,
      match: /^[a-z0-9]+$/,
      validate: {
        validator(value) {
          return POLICIES[this.kind]?.formats.has(value)
        },
        message: 'Format is not supported for this media kind',
      },
    },
    width: { type: Number, min: 1, max: MAX_IMAGE_DIMENSION, validate: integerValidation },
    height: { type: Number, min: 1, max: MAX_IMAGE_DIMENSION, validate: integerValidation },
    duration: { type: Number, min: 0.01, max: MAX_VIDEO_DURATION_SECONDS },
    bytes: {
      type: Number,
      required: true,
      min: 1,
      max: MAX_VIDEO_BYTES,
      validate: integerValidation,
    },
    previewAsset: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset' },
    alt: { type: String, required: true, trim: true, maxlength: 300 },
    status: {
      type: String,
      enum: ['active', 'pendingDeletion'],
      default: 'active',
      required: true,
    },
  },
  {
    collection: 'media_assets',
    timestamps: true,
    versionKey: false,
  },
)

mediaAssetSchema.pre('validate', function validateKindSpecificFields() {
  const policy = POLICIES[this.kind]
  if (!policy) return

  if (this.resourceType !== policy.resourceType) {
    this.invalidate('resourceType', `Resource type must be ${policy.resourceType} for ${this.kind}`)
  }

  const requiresDimensions = this.kind !== 'animation'
  if (requiresDimensions && (!this.width || !this.height)) {
    if (!this.width) this.invalidate('width', 'Width is required for this media kind')
    if (!this.height) this.invalidate('height', 'Height is required for this media kind')
  }
  if (!requiresDimensions && (this.width != null || this.height != null)) {
    if (this.width != null) this.invalidate('width', 'Width is not supported for animations')
    if (this.height != null) this.invalidate('height', 'Height is not supported for animations')
  }

  if (this.kind === 'video') {
    if (!this.duration) this.invalidate('duration', 'Duration is required for videos')
    if (this.width > MAX_VIDEO_DIMENSION) this.invalidate('width', 'Video width exceeds the limit')
    if (this.height > MAX_VIDEO_DIMENSION) this.invalidate('height', 'Video height exceeds the limit')
  } else if (this.duration != null) {
    this.invalidate('duration', 'Duration is supported only for videos')
  }

  const requiresPreview = this.kind === 'video' || this.kind === 'animation'
  if (requiresPreview && !this.previewAsset) {
    this.invalidate('previewAsset', 'A preview image is required for motion media')
  }
  if (!requiresPreview && this.previewAsset) {
    this.invalidate('previewAsset', 'A preview image is supported only for motion media')
  }
  if (this.previewAsset && this._id?.equals(this.previewAsset)) {
    this.invalidate('previewAsset', 'A media asset cannot preview itself')
  }

  const byteLimit = {
    image: MAX_IMAGE_BYTES,
    video: MAX_VIDEO_BYTES,
    animation: MAX_ANIMATION_BYTES,
    document: MAX_DOCUMENT_BYTES,
  }[this.kind]
  if (this.bytes > byteLimit) this.invalidate('bytes', `${this.kind} exceeds the maximum file size`)
})

mediaAssetSchema.index({ provider: 1, providerAssetId: 1 }, { unique: true })
mediaAssetSchema.index({ status: 1, createdAt: 1, _id: 1 })
mediaAssetSchema.index({ status: 1, kind: 1, createdAt: 1, _id: 1 })
mediaAssetSchema.index({ previewAsset: 1 }, { sparse: true })

export const MediaAsset = mongoose.model('MediaAsset', mediaAssetSchema)
