import express, { Router } from 'express'

export function createResendWebhookRouter({ webhookService }) {
  const router = Router()

  router.post(
    '/',
    express.raw({ type: 'application/json', limit: '100kb' }),
    async (request, response) => {
      await webhookService.handle(request.body, request.headers)
      response.json({ success: true, message: 'Webhook accepted.' })
    },
  )

  return router
}
