import {
  serializeAdminContactInquiry,
  serializeAdminContactListItem,
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

    delete: async (request, response) => {
      await contactService.deleteArchivedInquiry(request.validated.params.id)

      response.json({
        success: true,
        message: 'Contact inquiry deleted successfully.',
      })
    },
  }
}
