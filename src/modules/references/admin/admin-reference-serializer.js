function serializeDate(value) {
  if (value === undefined || value === null) return value ?? null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function serializeId(value) {
  if (value === undefined || value === null) return null
  return (value?._id ?? value?.id ?? value).toString()
}

function sourceOf(reference) {
  return typeof reference?.toObject === 'function' ? reference.toObject() : reference
}

export function serializeAdminReference(reference) {
  const source = sourceOf(reference)

  return {
    id: serializeId(source._id ?? source.id),
    name: source.name,
    email: source.normalizedEmail,
    company: source.company,
    position: source.position,
    originalTestimonial: source.originalTestimonial,
    testimonial: source.testimonial,
    ratings: {
      overall: source.ratings.overall,
      technical: source.ratings.technical,
      communication: source.ratings.communication,
    },
    status: source.status,
    displayOrder: source.displayOrder,
    moderation: {
      reason: source.moderation?.reason ?? null,
      note: source.moderation?.note ?? null,
      moderatedBy: serializeId(source.moderation?.moderatedBy),
      moderatedAt: serializeDate(source.moderation?.moderatedAt),
    },
    editedAt: serializeDate(source.editedAt),
    approvedAt: serializeDate(source.approvedAt),
    rejectedAt: serializeDate(source.rejectedAt),
    submittedAt: serializeDate(source.createdAt),
    updatedAt: serializeDate(source.updatedAt),
  }
}
