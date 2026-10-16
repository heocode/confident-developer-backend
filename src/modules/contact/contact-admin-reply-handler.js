import { renderContactAdminReply } from '../email/contact-admin-reply-template.js'
import { contactAdminReplyKind } from '../email/email-delivery-values.js'
import { EmailProviderError } from '../email/email-provider-error.js'
import { ContactInquiry } from './contact-inquiry.js'
import { ContactReply } from './contact-reply.js'

function applySelection(query, selection) {
  return typeof query?.select === 'function' ? query.select(selection) : query
}

export function createContactAdminReplyHandler({
  emailProvider,
  fromEmail,
  replyToEmail,
  contactReplyService,
  replyModel = ContactReply,
  inquiryModel = ContactInquiry,
} = {}) {
  return {
    async send(delivery) {
      const reply = await applySelection(replyModel.findById(delivery.sourceId), '+message')
      if (!reply) {
        throw new EmailProviderError('Contact reply source is missing', {
          code: 'source-missing',
          retryable: false,
        })
      }

      const inquiry = await applySelection(
        inquiryModel.findById(reply.inquiryId),
        '+email +message',
      )
      if (!inquiry) {
        throw new EmailProviderError('Contact inquiry source is missing', {
          code: 'source-missing',
          retryable: false,
        })
      }

      return emailProvider.sendEmail({
        from: `Vadim Iskakov <${fromEmail}>`,
        to: inquiry.email,
        replyTo: replyToEmail,
        ...renderContactAdminReply({ inquiry, reply }),
        tags: [{ name: 'delivery_id', value: delivery._id.toString() }],
        idempotencyKey: `${contactAdminReplyKind}/${delivery._id}`,
      })
    },

    accept(delivery, providerMessageId) {
      return contactReplyService.acceptReplyDelivery(delivery, providerMessageId)
    },
  }
}
