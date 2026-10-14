import { serializeAdminProfilePost } from './admin-profile-post-serializer.js'

export function createAdminProfilePostController({ profilePostService }) {
  return {
    get: async (_request, response) => {
      const post = await profilePostService.getPost()

      response.json({
        success: true,
        message: 'Profile post retrieved successfully.',
        data: serializeAdminProfilePost(post),
      })
    },

    replace: async (request, response) => {
      const result = await profilePostService.replacePost(request.validated.body)

      response.status(result.created ? 201 : 200).json({
        success: true,
        message: result.created
          ? 'Profile post created successfully.'
          : result.changed
            ? 'Profile post replaced successfully.'
            : 'Profile post is already up to date.',
        data: serializeAdminProfilePost(result.post),
      })
    },
  }
}
