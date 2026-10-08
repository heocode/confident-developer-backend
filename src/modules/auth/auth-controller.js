import { serializeAdmin } from './admin-serializer.js'
import {
  getAdminSessionClearOptions,
  getAdminSessionCookie,
} from './admin-session-cookie.js'

export function createAuthController({ authService, environment }) {
  const cookie = getAdminSessionCookie(environment)

  return {
    login: async (request, response) => {
      const { admin, token } = await authService.login(request.validated.body)

      response.cookie(cookie.name, token, cookie.options)
      response.json({
        success: true,
        message: 'Signed in successfully.',
        data: serializeAdmin(admin),
      })
    },

    getSession: async (request, response) => {
      response.json({
        success: true,
        message: 'Admin session retrieved successfully.',
        data: serializeAdmin(request.admin),
      })
    },

    logout: async (request, response) => {
      await authService.logout(request.cookies[cookie.name])
      response.clearCookie(cookie.name, getAdminSessionClearOptions(environment))
      response.json({
        success: true,
        message: 'Signed out successfully.',
      })
    },
  }
}
