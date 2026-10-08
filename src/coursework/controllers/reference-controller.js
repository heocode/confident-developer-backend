import { Reference } from '../models/reference.js'
import { createCrudController } from '../utils/crud-controller.js'
import { normalizeReferenceInput } from '../utils/input-normalizers.js'

export const referenceController = createCrudController({
  model: Reference,
  singularName: 'Reference',
  pluralName: 'References',
  normalizeInput: normalizeReferenceInput,
})
