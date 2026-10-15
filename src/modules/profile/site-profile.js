import mongoose from 'mongoose'

export const SITE_PROFILE_KEY = 'portfolio'

const publicIdentitySchema = new mongoose.Schema(
  {
    displayName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    handle: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 2,
      maxlength: 40,
      match: /^[a-z\d](?:[a-z\d._-]{0,38}[a-z\d])?$/,
    },
    avatarAsset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MediaAsset',
      required: true,
    },
  },
  { _id: false },
)

const siteProfileSchema = new mongoose.Schema(
  {
    key: { type: String, enum: [SITE_PROFILE_KEY], required: true, immutable: true },
    resumeAsset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MediaAsset',
      required: true,
    },
    publicIdentity: { type: publicIdentitySchema },
  },
  {
    collection: 'site_profiles',
    timestamps: true,
    versionKey: false,
  },
)

siteProfileSchema.index({ key: 1 }, { unique: true })

export const SiteProfile = mongoose.model('SiteProfile', siteProfileSchema)
