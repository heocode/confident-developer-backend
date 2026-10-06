import mongoose from 'mongoose'

import { publicSchemaOptions } from '../utils/schema-options.js'

const referenceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    testimonial: { type: String, required: true, trim: true, maxlength: 2_000 },
    position: { type: String, required: true, trim: true, maxlength: 120 },
    company: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
  },
  { ...publicSchemaOptions, timestamps: true },
)

referenceSchema.index({ createdAt: 1, _id: 1 })

export const Reference = mongoose.model('Reference', referenceSchema)
