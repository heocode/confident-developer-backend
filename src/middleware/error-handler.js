export function errorHandler(error, _request, response, _next) {
  let status = Number.isInteger(error.status) ? error.status : 500
  let errorMessage = error.message

  if (error.name === 'ValidationError') {
    status = 400
    errorMessage = `Validation failed: ${Object.values(error.errors)
      .map((validationError) => validationError.message)
      .join(', ')}`
  } else if (error.name === 'CastError' && error.kind === 'ObjectId') {
    status = 400
    errorMessage = 'Invalid resource ID'
  } else if (error.name === 'StrictModeError') {
    status = 400
  } else if (error.code === 11_000) {
    status = 409
    errorMessage = 'A resource with that unique value already exists'
  } else if (error.type === 'entity.parse.failed') {
    status = 400
    errorMessage = 'Request body contains invalid JSON'
  }

  const isProduction = process.env.NODE_ENV === 'production'
  const message = status === 500 && isProduction ? 'Internal server error' : errorMessage

  if (status >= 500) {
    console.error(error)
  }

  response.status(status).json({
    success: false,
    message,
  })
}
