import mongoose from 'mongoose'

export const REFERENCE_SECTION_KEY = 'home'

const referenceSectionSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, enum: [REFERENCE_SECTION_KEY], required: true, immutable: true },
    emptyStateMessage: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 300,
    },
    messageUpdatedAt: { type: Date, required: true },
  },
  {
    collection: 'reference_section_settings',
    timestamps: true,
    versionKey: false,
  },
)

referenceSectionSettingsSchema.index({ key: 1 }, { unique: true })

export const ReferenceSectionSettings = mongoose.model(
  'ReferenceSectionSettings',
  referenceSectionSettingsSchema,
)
