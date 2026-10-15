import { EmailProviderError } from '../email/email-provider-error.js'
import { renderContactOwnerNotification } from '../email/contact-owner-notification-template.js'
import { contactOwnerNotificationKind } from '../email/email-delivery-values.js'
import { ContactInquiry } from './contact-inquiry.js'

function applySelection(query, selection) {
  return typeof query?.select === 'function' ? query.select(selection) : query
}

export function createContactOwnerNotificationHandler({
  emailProvider,
  fromEmail,
  notificationToEmail,
  inquiryModel = ContactInquiry,
} = {}) {
  return async function sendContactOwnerNotification(delivery) {
    const inquiry = await applySelection(
      inquiryModel.findById(delivery.sourceId),
      '+email +message',
    )

    if (!inquiry) {
      throw new EmailProviderError('Contact inquiry source is missing', {
        code: 'source-missing',
        retryable: false,
      })
    }

    const content = renderContactOwnerNotification(inquiry)
    return emailProvider.sendEmail({
      from: `Confident Developer <${fromEmail}>`,
      to: notificationToEmail,
      ...content,
      idempotencyKey: `${contactOwnerNotificationKind}/${delivery._id}`,
    })
  }
}
