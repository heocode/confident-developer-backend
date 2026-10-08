import mongoose from 'mongoose'

import { publicSchemaOptions } from '../utils/schema-options.js'

const userSchema = new mongoose.Schema(
  {
    firstname: { type: String, required: true, trim: true, maxlength: 80 },
    lastname: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    password: { type: String, required: true, select: false },
    username: { type: String, trim: true, lowercase: true, maxlength: 80 },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    created: { type: Date, required: true, default: Date.now, immutable: true },
    updated: { type: Date, required: true, default: Date.now },
  },
  {
    ...publicSchemaOptions,
    timestamps: { createdAt: 'created', updatedAt: 'updated' },
  },
)

userSchema.index({ email: 1 }, { unique: true })
userSchema.index({ username: 1 }, { unique: true, sparse: true })

export const User = mongoose.model('User', userSchema)
