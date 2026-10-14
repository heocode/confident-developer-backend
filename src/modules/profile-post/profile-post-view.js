import mongoose from 'mongoose'

const profilePostViewSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'ProfilePost', required: true },
    revision: { type: Number, required: true, min: 1, validate: Number.isInteger },
    visitorHash: { type: String, required: true, minlength: 64, maxlength: 64, select: false },
    lastViewedAt: { type: Date, required: true },
  },
  {
    collection: 'profile_post_views',
    timestamps: true,
    versionKey: false,
  },
)

profilePostViewSchema.index({ post: 1, revision: 1, visitorHash: 1 }, { unique: true })
profilePostViewSchema.index({ post: 1, revision: 1 })

export const ProfilePostView = mongoose.model('ProfilePostView', profilePostViewSchema)
