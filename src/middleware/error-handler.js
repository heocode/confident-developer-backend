export function errorHandler(error, request, response, _next) {
  let status = Number.isInteger(error.status) ? error.status : 500
  let errorMessage = error.message

  if (error.name === 'ValidationError') {
    status = 400
    errorMessage = `Validation failed: ${Object.values(error.errors)
      .map((validationError) =>
        validationError.name === 'CastError'
          ? `Invalid value for ${validationError.path}`
          : validationError.message,
      )
      .join(', ')}`
  } else if (error.name === 'CastError') {
    status = 400
    errorMessage = error.kind === 'ObjectId' ? 'Invalid resource ID' : `Invalid value for ${error.path}`
  } else if (error.name === 'StrictModeError') {
    status = 400
  } else if (error.code === 11_000) {
    status = 409
    errorMessage = 'A resource with that unique value already exists'
  } else if (error.type === 'entity.parse.failed') {
    status = 400
    errorMessage = 'Request body contains invalid JSON'
  } else if (error.name === 'ZodError') {
    status = 400
    errorMessage = 'Request validation failed'
  }

  const isProduction = request.app.get('env') === 'production'
  const message = status === 500 && isProduction ? 'Internal server error' : errorMessage

  if (status >= 500) {
    console.error(error)
  }

  const errorResponse = {
    success: false,
    message,
  }

  if (error.name === 'ZodError') {
    errorResponse.details = error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }))
  }

  response.status(status).json(errorResponse)
}
