import createError from 'http-errors'

const PROJECT_PLACEHOLDER_IMAGE = '/images/project-placeholder.webp'

function assertRequestBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError(400, 'Request body must be a JSON object')
  }
}

function assertKnownFields(body, knownFields) {
  const unknownFields = Object.keys(body).filter((field) => !knownFields.has(field))

  if (unknownFields.length > 0) {
    throw createError(400, `Unknown field${unknownFields.length === 1 ? '' : 's'}: ${unknownFields.join(', ')}`)
  }
}

function readAlias(body, aliases, fieldName) {
  const suppliedValues = aliases
    .filter((alias) => body[alias] !== undefined)
    .map((alias) => body[alias])

  if (new Set(suppliedValues).size > 1) {
    throw createError(400, `Conflicting values supplied for ${fieldName}`)
  }

  return suppliedValues[0]
}

function copyDefinedFields(body, fields) {
  return Object.fromEntries([...fields].filter((field) => body[field] !== undefined).map((field) => [field, body[field]]))
}

function requireUpdateFields(input, partial) {
  if (partial && Object.keys(input).length === 0) {
    throw createError(400, 'At least one updatable field is required')
  }

  return input
}

const referenceFields = new Set([
  'name',
  'testimonial',
  'position',
  'company',
  'email',
  'firstname',
  'firstName',
  'lastname',
  'lastName',
])

export function normalizeReferenceInput(body, { partial = false } = {}) {
  assertRequestBody(body)
  assertKnownFields(body, referenceFields)

  const input = copyDefinedFields(body, ['name', 'testimonial', 'position', 'company', 'email'])
  const firstname = readAlias(body, ['firstname', 'firstName'], 'firstname')
  const lastname = readAlias(body, ['lastname', 'lastName'], 'lastname')
  const legacyName = [firstname, lastname].filter(Boolean).join(' ').trim()

  if (input.name === undefined && legacyName) {
    input.name = legacyName
  }

  if (!partial && input.testimonial === undefined && legacyName && input.email) {
    input.testimonial = `Reference provided by ${legacyName}.`
  }

  return requireUpdateFields(input, partial)
}

const projectFields = new Set(['title', 'completion', 'description', 'image'])

export function normalizeProjectInput(body, { partial = false } = {}) {
  assertRequestBody(body)
  assertKnownFields(body, projectFields)

  const input = copyDefinedFields(body, projectFields)

  if (!partial && input.image === undefined) {
    input.image = PROJECT_PLACEHOLDER_IMAGE
  }

  return requireUpdateFields(input, partial)
}

const serviceFields = new Set(['title', 'description'])

export function normalizeServiceInput(body, { partial = false } = {}) {
  assertRequestBody(body)
  assertKnownFields(body, serviceFields)

  return requireUpdateFields(copyDefinedFields(body, serviceFields), partial)
}

const userFields = new Set([
  'firstname',
  'firstName',
  'lastname',
  'lastName',
  'email',
  'password',
  'username',
  'role',
  'created',
  'updated',
])

export function normalizeUserInput(body, { partial = false } = {}) {
  assertRequestBody(body)
  assertKnownFields(body, userFields)

  const input = copyDefinedFields(body, ['email', 'password', 'username', 'role', 'created', 'updated'])
  const firstname = readAlias(body, ['firstname', 'firstName'], 'firstname')
  const lastname = readAlias(body, ['lastname', 'lastName'], 'lastname')

  if (firstname !== undefined) input.firstname = firstname
  if (lastname !== undefined) input.lastname = lastname

  if (
    input.password !== undefined &&
    (typeof input.password !== 'string' ||
      input.password.length < 8 ||
      Buffer.byteLength(input.password, 'utf8') > 72)
  ) {
    throw createError(400, 'Password must contain between 8 and 72 UTF-8 bytes')
  }

  return requireUpdateFields(input, partial)
}
