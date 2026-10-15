export const emailDeliveryKinds = Object.freeze(['contact-owner-notification'])

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
