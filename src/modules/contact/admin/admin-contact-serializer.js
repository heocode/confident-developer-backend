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

function splitAdminView(value) {
  if (value?.inquiry) {
    return {
      inquiry: sourceOf(value.inquiry),
      ownerNotification: value.ownerNotification ? sourceOf(value.ownerNotification) : null,
      replies: value.replies ?? [],
    }
  }

  return { inquiry: sourceOf(value), ownerNotification: null, replies: [] }
}

function serializeOwnerNotification(delivery, detailed) {
  if (!delivery) return null

  const notification = {
    status: delivery.status,
    attemptCount: delivery.attemptCount,
  }

  if (!detailed) return notification

  return {
    ...notification,
    lastAttemptAt: serializeDate(delivery.lastAttemptAt),
    acceptedAt: serializeDate(delivery.acceptedAt),
    failedAt: serializeDate(delivery.failedAt),
    lastFailureCode: delivery.lastFailureCode ?? null,
  }
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
  const view = splitAdminView(inquiry)

  return {
    ...serializeBaseInquiry(view.inquiry),
    ownerNotification: serializeOwnerNotification(view.ownerNotification, false),
  }
}

export function serializeAdminContactInquiry(inquiry) {
  const view = splitAdminView(inquiry)

  return {
    ...serializeBaseInquiry(view.inquiry),
    message: view.inquiry.message,
    ownerNotification: serializeOwnerNotification(view.ownerNotification, true),
    replies: view.replies.map(serializeAdminContactReply),
  }
}

export function serializeAdminContactReply(value) {
  const reply = sourceOf(value.reply ?? value)
  const delivery = value.delivery ? sourceOf(value.delivery) : null

  return {
    id: serializeId(reply._id ?? reply.id),
    message: reply.message,
    createdAt: serializeDate(reply.createdAt),
    delivery: serializeOwnerNotification(delivery, true),
  }
}
