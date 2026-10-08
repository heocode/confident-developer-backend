import mongoose from 'mongoose'

const adminSessionSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      required: true,
    },
    tokenHash: {
      type: String,
      required: true,
      select: false,
      minlength: 64,
      maxlength: 64,
    },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    toJSON: {
      transform(_document, returnedObject) {
        delete returnedObject.tokenHash
        return returnedObject
      },
    },
  },
)

adminSessionSchema.index({ tokenHash: 1 }, { unique: true })
adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
adminSessionSchema.index({ admin: 1 })

export const AdminSession = mongoose.model('AdminSession', adminSessionSchema)
