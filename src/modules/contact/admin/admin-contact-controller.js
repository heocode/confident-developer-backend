import {
  serializeAdminContactInquiry,
  serializeAdminContactListItem,
  serializeAdminContactReply,
  serializeAdminEmailDelivery,
} from './admin-contact-serializer.js'

export function createAdminContactController({ contactService }) {
  return {
    list: async (request, response) => {
      const { items, pagination } = await contactService.listAdminInquiries(request.validated.query)

      response.json({
        success: true,
        message: 'Contact inquiries retrieved successfully.',
        data: { items: items.map(serializeAdminContactListItem), pagination },
      })
    },

    getById: async (request, response) => {
      const inquiry = await contactService.getAdminInquiry(request.validated.params.id)

      response.json({
        success: true,
        message: 'Contact inquiry retrieved successfully.',
        data: serializeAdminContactInquiry(inquiry),
      })
    },

    updateStatus: async (request, response) => {
      const { id } = request.validated.params
      const { action } = request.validated.body
      const transitions = {
        read: contactService.markInquiryRead,
        archive: contactService.archiveInquiry,
        restore: contactService.restoreInquiry,
      }
      const inquiry = await transitions[action](id)

      response.json({
        success: true,
        message: 'Contact inquiry status updated successfully.',
        data: serializeAdminContactInquiry(inquiry),
      })
    },

    createReply: async (request, response) => {
      const reply = await contactService.queueAdminReply(
        request.validated.params.id,
        request.validated.body,
        request.validated.headers.idempotencyKey,
      )

      response.status(201).json({
        success: true,
        message: 'Contact reply queued successfully.',
        data: serializeAdminContactReply(reply),
      })
    },

    retryOwnerNotification: async (request, response) => {
      const delivery = await contactService.retryOwnerNotification(
        request.validated.params.id,
        request.validated.headers.idempotencyKey,
      )
      response.json({
        success: true,
        message: 'Owner notification queued for retry.',
        data: serializeAdminEmailDelivery(delivery),
      })
    },

    retryReply: async (request, response) => {
      const delivery = await contactService.retryAdminReply(
        request.validated.params.id,
        request.validated.params.replyId,
        request.validated.headers.idempotencyKey,
      )
      response.json({
        success: true,
        message: 'Contact reply queued for retry.',
        data: serializeAdminEmailDelivery(delivery),
      })
    },

    delete: async (request, response) => {
      await contactService.deleteArchivedInquiry(request.validated.params.id)

      response.json({
        success: true,
        message: 'Contact inquiry deleted successfully.',
      })
    },
  }
}
