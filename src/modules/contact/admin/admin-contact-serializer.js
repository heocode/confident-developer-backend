function serializeDate(value) {
  if (value === undefined || value === null) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function serializeId(value) {
  if (value === undefined || value === null) return null
  return (value?._id ?? value?.id ?? value).toString()
}

function sourceOf(inquiry) {
  return typeof inquiry?.toObject === 'function' ? inquiry.toObject() : inquiry
}

function serializeBaseInquiry(source) {
  return {
    id: serializeId(source._id ?? source.id),
    name: source.name,
    email: source.email,
    scopes: [...source.scopes],
    budget: source.budget,
    status: source.status,
    readAt: serializeDate(source.readAt),
    repliedAt: serializeDate(source.repliedAt),
    archivedAt: serializeDate(source.archivedAt),
    createdAt: serializeDate(source.createdAt),
  }
}

export function serializeAdminContactListItem(inquiry) {
  return serializeBaseInquiry(sourceOf(inquiry))
}

export function serializeAdminContactInquiry(inquiry) {
  const source = sourceOf(inquiry)

  return {
    ...serializeBaseInquiry(source),
    message: source.message,
  }
}
