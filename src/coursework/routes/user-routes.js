import { userController } from '../controllers/user-controller.js'
import { createResourceRouter } from './create-resource-router.js'

export const userRouter = createResourceRouter(userController)
