import { projectController } from '../controllers/project-controller.js'
import { createResourceRouter } from './create-resource-router.js'

export const projectRouter = createResourceRouter(projectController)
