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

export const emailRecipientStatuses = Object.freeze([
  'unknown',
  'delayed',
  'delivered',
  'bounced',
  'complained',
])

export const resendDeliveryEventTypes = Object.freeze([
  'email.sent',
  'email.delivery_delayed',
  'email.delivered',
  'email.bounced',
  'email.complained',
])

export const emailDeliveryFailureCodes = Object.freeze([
  'configuration',
  'timeout',
  'rate-limited',
  'provider-rejected',
  'provider-error',
  'source-missing',
])
