import mongoose from 'mongoose'

const adminUserSchema = new mongoose.Schema(
  {
    displayName: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
      match: /^\$2[aby]\$\d{2}\$.{53}$/,
    },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_document, returnedObject) {
        delete returnedObject.passwordHash
        return returnedObject
      },
    },
  },
)

adminUserSchema.index({ email: 1 }, { unique: true })

export const AdminUser = mongoose.model('AdminUser', adminUserSchema)
