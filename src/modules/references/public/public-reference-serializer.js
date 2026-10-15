function sourceOf(reference) {
  return typeof reference?.toObject === 'function' ? reference.toObject() : reference
}

function serializeId(value) {
  return (value?._id ?? value?.id ?? value).toString()
}

function serializeDate(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function serializePublicReference(reference) {
  const source = sourceOf(reference)

  return {
    id: serializeId(source._id ?? source.id),
    name: source.name,
    company: source.company,
    position: source.position,
    testimonial: source.testimonial,
    ratings: {
      overall: source.ratings.overall,
      technical: source.ratings.technical,
      communication: source.ratings.communication,
    },
    publishedAt: serializeDate(source.approvedAt),
  }
}

export function serializeOwnedReference(reference) {
  const source = sourceOf(reference)

  return {
    id: serializeId(source._id ?? source.id),
    name: source.name,
    company: source.company,
    position: source.position,
    testimonial: source.testimonial,
    ratings: {
      overall: source.ratings.overall,
      technical: source.ratings.technical,
      communication: source.ratings.communication,
    },
    status: source.status,
    submittedAt: serializeDate(source.createdAt),
    approvedAt: source.approvedAt ? serializeDate(source.approvedAt) : null,
  }
}
import { serializePublicProfileIdentity } from '../../profile/public/public-profile-serializer.js'


export function serializeReferenceEmptyState(emptyState) {
  if (!emptyState) return null

  const settings = sourceOf(emptyState.settings)

  return {
    author: serializePublicProfileIdentity(emptyState.identity),
    message: settings.emptyStateMessage,
    updatedAt: serializeDate(settings.messageUpdatedAt),
  }
}
