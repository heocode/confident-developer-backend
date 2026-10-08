import mongoose from 'mongoose'

import { publicSchemaOptions } from '../utils/schema-options.js'

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    completion: { type: Date, required: true },
    description: { type: String, required: true, trim: true, maxlength: 5_000 },
    image: { type: String, required: true, trim: true, maxlength: 2_048 },
  },
  { ...publicSchemaOptions, timestamps: true },
)

projectSchema.index({ createdAt: 1, _id: 1 })

export const Project = mongoose.model('Project', projectSchema)
