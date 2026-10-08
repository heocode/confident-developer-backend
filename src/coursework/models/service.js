import mongoose from 'mongoose'

import { publicSchemaOptions } from '../utils/schema-options.js'

const serviceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 5_000 },
  },
  { ...publicSchemaOptions, timestamps: true },
)

serviceSchema.index({ createdAt: 1, _id: 1 })

export const Service = mongoose.model('Service', serviceSchema)
