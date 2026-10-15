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
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    GITHUB_USERNAME: z.string().optional(),
    GITHUB_TOKEN: z.string().optional(),
    TURNSTILE_SECRET_KEY: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM_EMAIL: z.string().optional(),
    CONTACT_NOTIFICATION_TO_EMAIL: z.string().optional(),
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

function parseCloudinaryConfiguration(raw) {
  const values = [raw.CLOUDINARY_CLOUD_NAME, raw.CLOUDINARY_API_KEY, raw.CLOUDINARY_API_SECRET].map((value) =>
    value?.trim(),
  )
  const configuredValues = values.filter(Boolean)

  if (configuredValues.length === 0) return null
  if (configuredValues.length !== values.length) {
    throw new Error('CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET must be configured together')
  }

  const [cloudName, apiKey, apiSecret] = values

  if (!/^[a-zA-Z0-9_-]+$/.test(cloudName)) {
    throw new Error('CLOUDINARY_CLOUD_NAME contains invalid characters')
  }

  return Object.freeze({ cloudName, apiKey, apiSecret })
}

function parseGitHubConfiguration(raw) {
  const username = raw.GITHUB_USERNAME?.trim()
  const token = raw.GITHUB_TOKEN?.trim()

  if (!username && !token) return null
  if (!username) throw new Error('GITHUB_USERNAME is required when GITHUB_TOKEN is configured')
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username)) {
    throw new Error('GITHUB_USERNAME is invalid')
  }

  return Object.freeze({ username: username.toLowerCase(), token: token || undefined })
}

const turnstileTestSecrets = new Set([
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
])

function parseTurnstileConfiguration(raw, clientOrigins) {
  const secretKey = raw.TURNSTILE_SECRET_KEY?.trim()
  if (!secretKey) return null

  const testMode = turnstileTestSecrets.has(secretKey)
  if (raw.NODE_ENV === 'production' && testMode) {
    throw new Error('Cloudflare Turnstile test credentials cannot be used in production')
  }

  return Object.freeze({
    secretKey,
    testMode,
    expectedHostnames: Object.freeze([
      ...new Set(clientOrigins.map((origin) => new URL(origin).hostname)),
    ]),
  })
}

function parseEmailConfiguration(raw) {
  const values = [
    raw.RESEND_API_KEY,
    raw.RESEND_FROM_EMAIL,
    raw.CONTACT_NOTIFICATION_TO_EMAIL,
  ].map((value) => value?.trim())
  const configuredValues = values.filter(Boolean)

  if (configuredValues.length === 0) return null
  if (configuredValues.length !== values.length) {
    throw new Error(
      'RESEND_API_KEY, RESEND_FROM_EMAIL, and CONTACT_NOTIFICATION_TO_EMAIL must be configured together',
    )
  }

  const [, fromEmail, notificationToEmail] = values
  const emailSchema = z.string().email().max(254)

  if (!emailSchema.safeParse(fromEmail).success) {
    throw new Error('RESEND_FROM_EMAIL must be a valid email address')
  }
  if (!emailSchema.safeParse(notificationToEmail).success) {
    throw new Error('CONTACT_NOTIFICATION_TO_EMAIL must be a valid email address')
  }

  return Object.freeze({
    apiKey: values[0],
    fromEmail: fromEmail.toLowerCase(),
    notificationToEmail: notificationToEmail.toLowerCase(),
  })
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

  const clientOrigins = Object.freeze(parseOrigins(raw.CLIENT_ORIGINS ?? raw.CLIENT_ORIGIN, raw.NODE_ENV))

  return Object.freeze({
    nodeEnv: raw.NODE_ENV,
    port: getPort(raw.PORT),
    mongodbUri: raw.MONGODB_URI,
    clientOrigins,
    trustProxy: parseTrustProxy(raw.TRUST_PROXY),
    enableCourseworkApi: parseBoolean(raw.ENABLE_COURSEWORK_API, 'ENABLE_COURSEWORK_API'),
    cloudinary: parseCloudinaryConfiguration(raw),
    github: parseGitHubConfiguration(raw),
    turnstile: parseTurnstileConfiguration(raw, clientOrigins),
    email: parseEmailConfiguration(raw),
  })
}
