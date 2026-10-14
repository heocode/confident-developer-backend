import { serializeAdminGitHubSnapshot } from './admin-github-serializer.js'

export function createAdminGitHubController({ githubService }) {
  return {
    refresh: async (_request, response) => {
      const snapshot = await githubService.refreshSnapshot()

      response.json({
        success: true,
        message: 'GitHub summary refreshed successfully.',
        data: serializeAdminGitHubSnapshot(snapshot),
      })
    },
  }
}
