export const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1_000

export function getAdminSessionCookie(environment) {
  const secure = environment.nodeEnv === 'production'

  return {
    name: secure ? '__Secure-cd_admin_session' : 'cd_admin_session',
    options: {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/api/v1',
      maxAge: ADMIN_SESSION_TTL_MS,
    },
  }
}

export function getAdminSessionClearOptions(environment) {
  const { options } = getAdminSessionCookie(environment)

  return {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
  }
}
