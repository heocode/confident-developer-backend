import { z } from 'zod'

const DEFAULT_PORT = 3000
const DEFAULT_CLIENT_ORIGIN = 'http://localhost:5173'

const rawEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.string().optional(),
    MONGODB_URI: z.string().optional(),
    CLIENT_ORIGIN: z.string().optional(),
    CLIENT_ORIGINS: z.string().optional(),
    TRUST_PROXY: z.string().optional(),
    ENABLE_COURSEWORK_API: z.string().optional(),
  })
  .passthrough()

function parseBoolean(value, name, defaultValue = false) {
  if (value === undefined || value === '') return defaultValue
  if (value === 'true') return true
  if (value === 'false') return false

  throw new Error(`${name} must be either true or false`)
}

function parseTrustProxy(value) {
  if (value === undefined || value === '' || value === 'false' || value === '0') return false

  const trustedHops = Number(value)

  if (!Number.isInteger(trustedHops) || trustedHops < 1) {
    throw new Error('TRUST_PROXY must be false, 0, or a positive integer hop count')
  }

  return trustedHops
}

function parseOrigins(value, nodeEnv) {
  const configuredValue = value ?? (nodeEnv === 'production' ? undefined : DEFAULT_CLIENT_ORIGIN)

  if (!configuredValue) {
    throw new Error('CLIENT_ORIGINS is required in production')
  }

  const origins = configuredValue
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (origins.length === 0) {
    throw new Error('CLIENT_ORIGINS must contain at least one origin')
  }

  for (const origin of origins) {
    let url

    try {
      url = new URL(origin)
    } catch {
      throw new Error(`CLIENT_ORIGINS contains an invalid origin: ${origin}`)
    }

    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || origin === 'null') {
      throw new Error(`CLIENT_ORIGINS contains an invalid origin: ${origin}`)
    }
  }

  return [...new Set(origins)]
}

export function getPort(value) {
  if (value === undefined || value === '') {
    return DEFAULT_PORT
  }

  const port = Number(value)

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535')
  }

  return port
}

export function loadEnvironment(source = process.env) {
  const parsed = rawEnvironmentSchema.safeParse(source)

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
    throw new Error(`Invalid environment configuration: ${details}`)
  }

  const raw = parsed.data

  return Object.freeze({
    nodeEnv: raw.NODE_ENV,
    port: getPort(raw.PORT),
    mongodbUri: raw.MONGODB_URI,
    clientOrigins: Object.freeze(parseOrigins(raw.CLIENT_ORIGINS ?? raw.CLIENT_ORIGIN, raw.NODE_ENV)),
    trustProxy: parseTrustProxy(raw.TRUST_PROXY),
    enableCourseworkApi: parseBoolean(raw.ENABLE_COURSEWORK_API, 'ENABLE_COURSEWORK_API'),
  })
}
