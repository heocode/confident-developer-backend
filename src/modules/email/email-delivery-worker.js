import { EmailProviderError } from './email-provider-error.js'
import { emailDeliveryFailureCodes } from './email-delivery-values.js'

const DEFAULT_POLL_INTERVAL_MS = 5_000
const DEFAULT_MAX_ATTEMPTS = 5
const DEFAULT_RETRY_DELAYS_MS = Object.freeze([60_000, 300_000, 900_000, 3_600_000])
const MAX_PROVIDER_RETRY_AFTER_MS = 14_400_000

function deliveryId(delivery) {
  return (delivery?._id ?? delivery?.id).toString()
}

function normalizeDeliveryError(error) {
  if (
    error instanceof EmailProviderError &&
    emailDeliveryFailureCodes.includes(error.code) &&
    typeof error.retryable === 'boolean'
  ) {
    return error
  }

  return new EmailProviderError('Unexpected email delivery failure', {
    code: 'provider-error',
    retryable: true,
  })
}

function retryDelayFor(error, attemptCount, retryDelaysMs) {
  const baseDelay = retryDelaysMs[Math.min(attemptCount - 1, retryDelaysMs.length - 1)]
  const providerDelay = Math.min(error.retryAfterMs ?? 0, MAX_PROVIDER_RETRY_AFTER_MS)
  return Math.max(baseDelay, providerDelay)
}

export function createEmailDeliveryWorker({
  deliveryService,
  handlers,
  logger = console,
  now = () => new Date(),
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
} = {}) {
  let running = false
  let scheduledTick
  let activeOperation

  async function processNext() {
    const delivery = await deliveryService.claimNextDelivery()
    if (!delivery) return false

    const id = deliveryId(delivery)
    const handler = handlers.get(delivery.kind)

    try {
      if (!handler) {
        throw new EmailProviderError('Email delivery handler is not configured', {
          code: 'configuration',
          retryable: false,
        })
      }

      const send = typeof handler === 'function' ? handler : handler.send
      if (typeof send !== 'function') {
        throw new EmailProviderError('Email delivery handler is not configured', {
          code: 'configuration',
          retryable: false,
        })
      }

      const result = await send(delivery)
      const updated =
        typeof handler.accept === 'function'
          ? await handler.accept(delivery, result.providerMessageId)
          : await deliveryService.markDeliveryAccepted(
              id,
              delivery.attemptCount,
              result.providerMessageId,
            )

      if (updated) {
        logger.info('Email delivery accepted', {
          deliveryId: id,
          kind: delivery.kind,
          attemptCount: delivery.attemptCount,
        })
      }
    } catch (caughtError) {
      const error = normalizeDeliveryError(caughtError)
      const shouldRetry = error.retryable && delivery.attemptCount < maxAttempts

      if (shouldRetry) {
        const retryDelayMs = retryDelayFor(error, delivery.attemptCount, retryDelaysMs)
        const nextAttemptAt = new Date(now().getTime() + retryDelayMs)
        const updated = await deliveryService.rescheduleDelivery(
          id,
          delivery.attemptCount,
          error.code,
          nextAttemptAt,
        )

        if (updated) {
          logger.warn('Email delivery scheduled for retry', {
            deliveryId: id,
            kind: delivery.kind,
            attemptCount: delivery.attemptCount,
            failureCode: error.code,
            nextAttemptAt: nextAttemptAt.toISOString(),
          })
        }
      } else {
        const updated = await deliveryService.markDeliveryFailed(
          id,
          delivery.attemptCount,
          error.code,
        )

        if (updated) {
          logger.error('Email delivery failed', {
            deliveryId: id,
            kind: delivery.kind,
            attemptCount: delivery.attemptCount,
            failureCode: error.code,
          })
        }
      }
    }

    return true
  }

  function queueNextTick(delayMs) {
    if (!running) return

    scheduledTick = schedule(() => {
      scheduledTick = undefined
      void tick()
    }, delayMs)
    scheduledTick?.unref?.()
  }

  async function tick() {
    if (!running) return

    try {
      activeOperation = processNext()
      const processedDelivery = await activeOperation
      queueNextTick(processedDelivery ? 0 : pollIntervalMs)
    } catch {
      logger.error('Email delivery worker polling failed')
      queueNextTick(pollIntervalMs)
    } finally {
      activeOperation = undefined
    }
  }

  return {
    processNext,

    start() {
      if (running) return
      running = true
      queueNextTick(0)
    },

    async stop() {
      running = false
      if (scheduledTick !== undefined) {
        cancelSchedule(scheduledTick)
        scheduledTick = undefined
      }
      await activeOperation
    },
  }
}
