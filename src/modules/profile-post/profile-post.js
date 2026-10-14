import mongoose from 'mongoose'

export const PROFILE_POST_KEY = 'home'
export const PROFILE_POST_TEXT_MAX_LENGTH = 500

const integerValidation = {
  validator: Number.isInteger,
  message: '{PATH} must be an integer',
}

const profilePostSchema = new mongoose.Schema(
  {
    key: { type: String, enum: [PROFILE_POST_KEY], required: true, immutable: true },
    text: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: PROFILE_POST_TEXT_MAX_LENGTH,
    },
    revision: { type: Number, required: true, min: 1, validate: integerValidation },
    contentUpdatedAt: { type: Date, required: true },
    likeCount: { type: Number, required: true, min: 0, default: 0, validate: integerValidation },
    viewCount: { type: Number, required: true, min: 0, default: 0, validate: integerValidation },
  },
  {
    collection: 'profile_posts',
    timestamps: true,
    versionKey: false,
  },
)

profilePostSchema.index({ key: 1 }, { unique: true })

export const ProfilePost = mongoose.model('ProfilePost', profilePostSchema)
