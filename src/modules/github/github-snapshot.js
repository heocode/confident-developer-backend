import mongoose from 'mongoose'

export const githubRefreshFailureCodes = Object.freeze([
  'not-found',
  'rate-limited',
  'timeout',
  'provider-error',
])

const githubSnapshotSchema = new mongoose.Schema(
  {
    key: { type: String, enum: ['portfolio'], required: true, immutable: true },
    username: { type: String, required: true, trim: true, lowercase: true },
    repositoryCount: { type: Number, required: true, min: 0, validate: Number.isInteger },
    languageCount: { type: Number, required: true, min: 0, validate: Number.isInteger },
    sourceEtag: { type: String },
    refreshedAt: { type: Date, required: true },
    lastAttemptAt: { type: Date, required: true },
    lastFailureAt: { type: Date },
    lastFailureCode: { type: String, enum: githubRefreshFailureCodes },
  },
  {
    collection: 'github_snapshots',
    timestamps: true,
    versionKey: false,
  },
)

githubSnapshotSchema.index({ key: 1 }, { unique: true })

export const GitHubSnapshot = mongoose.model('GitHubSnapshot', githubSnapshotSchema)
