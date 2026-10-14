import { createHash, randomBytes } from 'node:crypto'

const VISITOR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
export const VISITOR_COOKIE_TTL_MS = 365 * 24 * 60 * 60 * 1_000

export function getVisitorCookie(environment) {
  const secure = environment.nodeEnv === 'production'

  return {
    name: secure ? '__Secure-cd_visitor' : 'cd_visitor',
    options: {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/api/v1',
      maxAge: VISITOR_COOKIE_TTL_MS,
    },
  }
}

export function readVisitorToken(request, environment) {
  const { name } = getVisitorCookie(environment)
  const token = request.cookies[name]
  return typeof token === 'string' && VISITOR_TOKEN_PATTERN.test(token) ? token : null
}

export function ensureVisitorToken(
  request,
  response,
  environment,
  createToken = () => randomBytes(32).toString('base64url'),
) {
  const existingToken = readVisitorToken(request, environment)
  if (existingToken) return existingToken

  const token = createToken()
  const cookie = getVisitorCookie(environment)
  response.cookie(cookie.name, token, cookie.options)
  return token
}

export function hashVisitorToken(token) {
  return token ? createHash('sha256').update(token).digest('hex') : null
}
