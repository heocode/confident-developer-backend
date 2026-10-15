export class EmailProviderError extends Error {
  constructor(message, { code, retryable, retryAfterMs } = {}) {
    super(message)
    this.name = 'EmailProviderError'
    this.code = code
    this.retryable = retryable
    this.retryAfterMs = retryAfterMs
  }
}
