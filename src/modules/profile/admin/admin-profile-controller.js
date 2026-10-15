import { serializeAdminProfileIdentity, serializeAdminResume } from './admin-profile-serializer.js'

export function createAdminProfileController({ profileService }) {
  return {
    getPublicIdentity: async (_request, response) => {
      const identity = await profileService.getPublicIdentity()

      response.json({
        success: true,
        message: 'Public profile retrieved successfully.',
        data: serializeAdminProfileIdentity(identity),
      })
    },

    updatePublicIdentity: async (request, response) => {
      const identity = await profileService.updatePublicIdentity(request.validated.body)

      response.json({
        success: true,
        message: identity.changed
          ? 'Public profile updated successfully.'
          : 'Public profile is already up to date.',
        data: serializeAdminProfileIdentity(identity),
      })
    },

    createResumeUploadSignature: (_request, response) => {
      const descriptor = profileService.createResumeUploadDescriptor()

      response.json({
        success: true,
        message: 'Resume upload signature created successfully.',
        data: descriptor,
      })
    },

    getResume: async (_request, response) => {
      const resume = await profileService.getResume()

      response.json({
        success: true,
        message: 'Resume retrieved successfully.',
        data: serializeAdminResume(resume),
      })
    },

    replaceResume: async (request, response) => {
      const result = await profileService.replaceResume(request.validated.body)

      response.status(result.created ? 201 : 200).json({
        success: true,
        message: result.created
          ? 'Resume created successfully.'
          : result.changed
            ? 'Resume replaced successfully.'
            : 'Resume is already up to date.',
        data: serializeAdminResume(result),
      })
    },
  }
}
