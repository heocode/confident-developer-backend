import createError from 'http-errors'
import { Webhook } from 'svix'

export function createResendWebhookService({ webhookSecret, eventService } = {}) {
  const verifier = webhookSecret ? new Webhook(webhookSecret) : null

  return {
    async handle(rawBody, headers) {
      if (!verifier) throw createError(503, 'Email webhook is not configured')
      if (!Buffer.isBuffer(rawBody)) throw createError(400, 'Invalid webhook payload')

      const payload = rawBody.toString('utf8')
      try {
        verifier.verify(payload, {
          'svix-id': headers['svix-id'],
          'svix-timestamp': headers['svix-timestamp'],
          'svix-signature': headers['svix-signature'],
        })
      } catch {
        throw createError(400, 'Invalid webhook signature')
      }

      let event
      try {
        event = JSON.parse(payload)
      } catch {
        throw createError(400, 'Invalid webhook payload')
      }

      return eventService.processProviderEvent(headers['svix-id'], event)
    },
  }
}
