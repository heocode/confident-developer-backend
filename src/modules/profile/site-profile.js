import mongoose from 'mongoose'

export const SITE_PROFILE_KEY = 'portfolio'

const siteProfileSchema = new mongoose.Schema(
  {
    key: { type: String, enum: [SITE_PROFILE_KEY], required: true, immutable: true },
    resumeAsset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MediaAsset',
      required: true,
    },
  },
  {
    collection: 'site_profiles',
    timestamps: true,
    versionKey: false,
  },
)

siteProfileSchema.index({ key: 1 }, { unique: true })

export const SiteProfile = mongoose.model('SiteProfile', siteProfileSchema)
