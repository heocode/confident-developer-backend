import { getAdminSessionCookie } from '../utils/admin-session-cookie.js'

export function requireAdminSession({ authService, environment }) {
  return async (request, _response, next) => {
    try {
      const { name } = getAdminSessionCookie(environment)
      request.admin = await authService.getAdminForToken(request.cookies[name])
      next()
    } catch (error) {
      next(error)
    }
  }
}
