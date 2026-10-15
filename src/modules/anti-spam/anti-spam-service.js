const REFERENCE_SUBMISSION_ACTION = 'reference_submit'
const CONTACT_SUBMISSION_ACTION = 'contact_submit'

export function createAntiSpamService({ turnstileProvider }) {
  return {
    async verifyReferenceSubmission({ token, remoteIp }) {
      return turnstileProvider.verify({
        token,
        remoteIp,
        action: REFERENCE_SUBMISSION_ACTION,
      })
    },

    async verifyContactSubmission({ token, remoteIp }) {
      return turnstileProvider.verify({
        token,
        remoteIp,
        action: CONTACT_SUBMISSION_ACTION,
      })
    },
  }
}
