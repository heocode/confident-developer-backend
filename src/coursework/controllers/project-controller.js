import { Project } from '../models/project.js'
import { createCrudController } from '../utils/crud-controller.js'
import { normalizeProjectInput } from '../utils/input-normalizers.js'

export const projectController = createCrudController({
  model: Project,
  singularName: 'Project',
  pluralName: 'Projects',
  normalizeInput: normalizeProjectInput,
})
