import { EmailProviderError } from '../email-provider-error.js'

const RESEND_EMAILS_URL = 'https://api.resend.com/emails'
const DEFAULT_TIMEOUT_MS = 10_000

function retryAfterMilliseconds(response) {
  const value = response.headers.get('retry-after')
  if (!value) return undefined

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000)

  const date = Date.parse(value)
  if (Number.isNaN(date)) return undefined

  return Math.max(0, date - Date.now())
}

function providerErrorForResponse(response) {
  if (response.status === 429) {
    return new EmailProviderError('Email provider rate limit exceeded', {
      code: 'rate-limited',
      retryable: true,
      retryAfterMs: retryAfterMilliseconds(response),
    })
  }

  if (response.status >= 500) {
    return new EmailProviderError('Email provider is unavailable', {
      code: 'provider-error',
      retryable: true,
    })
  }

  return new EmailProviderError('Email provider rejected the request', {
    code: 'provider-rejected',
    retryable: false,
  })
}

export function createResendEmailProvider({
  apiKey,
  fetchImplementation = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  return {
    async sendEmail({ from, to, subject, html, text, idempotencyKey }) {
      let response

      try {
        response = await fetchImplementation(RESEND_EMAILS_URL, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
            'idempotency-key': idempotencyKey,
          },
          body: JSON.stringify({ from, to: [to], subject, html, text }),
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (error) {
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
          throw new EmailProviderError('Email provider request timed out', {
            code: 'timeout',
            retryable: true,
          })
        }

        throw new EmailProviderError('Email provider request failed', {
          code: 'provider-error',
          retryable: true,
        })
      }

      if (!response.ok) throw providerErrorForResponse(response)

      let data
      try {
        data = await response.json()
      } catch {
        throw new EmailProviderError('Email provider returned an invalid response', {
          code: 'provider-error',
          retryable: true,
        })
      }

      if (typeof data?.id !== 'string' || data.id.length === 0 || data.id.length > 255) {
        throw new EmailProviderError('Email provider returned an invalid message ID', {
          code: 'provider-error',
          retryable: true,
        })
      }

      return { providerMessageId: data.id }
    },
  }
}
