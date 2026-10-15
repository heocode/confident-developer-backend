const REFERENCE_SUBMISSION_ACTION = 'reference_submit'

export function createAntiSpamService({ turnstileProvider }) {
  return {
    async verifyReferenceSubmission({ token, remoteIp }) {
      return turnstileProvider.verify({
        token,
        remoteIp,
        action: REFERENCE_SUBMISSION_ACTION,
      })
    },
  }
}
