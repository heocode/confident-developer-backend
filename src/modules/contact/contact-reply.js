import mongoose from 'mongoose'

const unsafeCharactersPattern = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u

const contactReplySchema = new mongoose.Schema(
  {
    inquiryId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 5_000,
      select: false,
      validate: {
        validator: (value) => !unsafeCharactersPattern.test(value),
        message: 'Reply contains unsupported characters',
      },
    },
    commandFingerprint: {
      type: String,
      required: true,
      immutable: true,
      select: false,
      minlength: 64,
      maxlength: 64,
      match: /^[a-f\d]{64}$/,
    },
  },
  {
    collection: 'contact_replies',
    timestamps: true,
    versionKey: false,
  },
)

contactReplySchema.index({ commandFingerprint: 1 }, { unique: true })
contactReplySchema.index({ inquiryId: 1, createdAt: 1, _id: 1 })

export const ContactReply = mongoose.model('ContactReply', contactReplySchema)
