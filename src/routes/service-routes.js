import { serviceController } from '../controllers/service-controller.js'
import { createResourceRouter } from './create-resource-router.js'

export const serviceRouter = createResourceRouter(serviceController)
