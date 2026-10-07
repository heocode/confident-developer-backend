const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function requireTrustedOrigin(allowedOrigins) {
  return (request, _response, next) => {
    if (SAFE_METHODS.has(request.method)) {
      next()
      return
    }

    const origin = request.get('origin')

    if (!origin || !allowedOrigins.includes(origin)) {
      const error = new Error('Trusted origin is required')
      error.status = 403
      next(error)
      return
    }

    next()
  }
}
