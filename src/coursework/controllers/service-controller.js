import { Service } from '../models/service.js'
import { createCrudController } from '../utils/crud-controller.js'
import { normalizeServiceInput } from '../utils/input-normalizers.js'

export const serviceController = createCrudController({
  model: Service,
  singularName: 'Service',
  pluralName: 'Services',
  normalizeInput: normalizeServiceInput,
})
