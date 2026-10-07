const requestParts = ['body', 'params', 'query']

export function validateRequest(schemas) {
  return async (request, _response, next) => {
    try {
      const validated = {}

      for (const part of requestParts) {
        if (schemas[part]) {
          validated[part] = await schemas[part].parseAsync(request[part])
        }
      }

      request.validated = Object.freeze(validated)
      next()
    } catch (error) {
      next(error)
    }
  }
}
