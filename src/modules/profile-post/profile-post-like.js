import mongoose from 'mongoose'

const profilePostLikeSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'ProfilePost', required: true },
    revision: { type: Number, required: true, min: 1, validate: Number.isInteger },
    visitorHash: { type: String, required: true, minlength: 64, maxlength: 64, select: false },
  },
  {
    collection: 'profile_post_likes',
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
)

profilePostLikeSchema.index({ post: 1, revision: 1, visitorHash: 1 }, { unique: true })
profilePostLikeSchema.index({ post: 1, revision: 1 })

export const ProfilePostLike = mongoose.model('ProfilePostLike', profilePostLikeSchema)
