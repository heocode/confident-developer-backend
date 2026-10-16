export const contactOwnerNotificationKind = 'contact-owner-notification'
export const contactAdminReplyKind = 'contact-admin-reply'

export const emailDeliveryKinds = Object.freeze([
  contactOwnerNotificationKind,
  contactAdminReplyKind,
])

export const emailDeliveryStatuses = Object.freeze([
  'pending',
  'processing',
  'accepted',
  'failed',
])

export const emailDeliveryFailureCodes = Object.freeze([
  'configuration',
  'timeout',
  'rate-limited',
  'provider-rejected',
  'provider-error',
  'source-missing',
])
