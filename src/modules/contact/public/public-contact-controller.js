export function createPublicContactController({ contactService }) {
  return {
    submit: async (request, response) => {
      await contactService.submitInquiry(request.validated.body, { remoteIp: request.ip })

      response.status(201).json({
        success: true,
        message: 'Your inquiry was sent successfully.',
      })
    },
  }
}
