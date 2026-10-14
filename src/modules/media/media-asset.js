import mongoose from 'mongoose'

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_IMAGE_DIMENSION = 10_000
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024

const integerValidation = {
  validator: Number.isInteger,
  message: '{PATH} must be an integer',
}

const ALLOWED_FORMATS_BY_KIND = Object.freeze({
  image: new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']),
  document: new Set(['pdf']),
})

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
    kind: { type: String, enum: ['image', 'document'], required: true, default: 'image' },
    providerAssetId: { type: String, required: true, trim: true, maxlength: 255 },
    secureUrl: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2_048,
      validate: { validator: isSecureUrl, message: 'Media URL must use HTTPS' },
    },
    resourceType: { type: String, enum: ['image'], required: true, default: 'image' },
    format: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 20,
      match: /^[a-z0-9]+$/,
      validate: {
        validator(value) {
          return ALLOWED_FORMATS_BY_KIND[this.kind]?.has(value)
        },
        message: 'Format is not supported for {PATH}',
      },
    },
    width: { type: Number, required: true, min: 1, max: MAX_IMAGE_DIMENSION, validate: integerValidation },
    height: { type: Number, required: true, min: 1, max: MAX_IMAGE_DIMENSION, validate: integerValidation },
    bytes: {
      type: Number,
      required: true,
      min: 1,
      max: MAX_IMAGE_BYTES,
      validate: [
        integerValidation,
        {
          validator(value) {
            return this.kind !== 'document' || value <= MAX_DOCUMENT_BYTES
          },
          message: 'Document exceeds the maximum file size',
        },
      ],
    },
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

mediaAssetSchema.index({ provider: 1, providerAssetId: 1 }, { unique: true })
mediaAssetSchema.index({ status: 1, createdAt: 1, _id: 1 })

export const MediaAsset = mongoose.model('MediaAsset', mediaAssetSchema)
