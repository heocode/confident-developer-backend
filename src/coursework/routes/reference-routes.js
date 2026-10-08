import { referenceController } from '../controllers/reference-controller.js'
import { createResourceRouter } from './create-resource-router.js'

export const referenceRouter = createResourceRouter(referenceController)
