import createError from 'http-errors'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const REQUEST_TIMEOUT_MS = 5_000

function unavailableError() {
  return createError(503, 'Submission verification is temporarily unavailable')
}

function rejectedError() {
  return createError(400, 'Submission verification failed')
}

export function createCloudflareTurnstileProvider(
  configuration,
  { fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {},
) {
  return {
    async verify({ token, remoteIp, action }) {
      if (!configuration) throw unavailableError()

      const body = new URLSearchParams({
        secret: configuration.secretKey,
        response: token,
      })
      if (remoteIp) body.set('remoteip', remoteIp)

      let response
      try {
        response = await fetchImpl(SITEVERIFY_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch {
        throw unavailableError()
      }

      if (!response.ok) throw unavailableError()

      let result
      try {
        result = await response.json()
      } catch {
        throw unavailableError()
      }

      if (!result || typeof result.success !== 'boolean') throw unavailableError()
      if (!result.success) throw rejectedError()

      if (!configuration.testMode) {
        if (!configuration.expectedHostnames.includes(result.hostname) || result.action !== action) {
          throw rejectedError()
        }
      }

      return true
    },
  }
}
