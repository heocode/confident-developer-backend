import { Router } from 'express'

export function createResourceRouter(controller) {
  const router = Router()

  router.route('/').get(controller.getAll).post(controller.create)
  router.route('/:id').get(controller.getById).put(controller.update).delete(controller.delete)

  return router
}
