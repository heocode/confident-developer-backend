export function errorHandler(error, _request, response, _next) {
  const status = Number.isInteger(error.status) ? error.status : 500
  const isProduction = process.env.NODE_ENV === 'production'
  const message = status === 500 && isProduction ? 'Internal server error' : error.message

  if (status >= 500) {
    console.error(error)
  }

  response.status(status).json({
    success: false,
    message,
  })
}
