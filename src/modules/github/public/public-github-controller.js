import { sendCacheablePublicJson } from '../../../utils/public-response.js'
import { serializePublicGitHubSummary } from './public-github-serializer.js'

export function createPublicGitHubController({ githubService }) {
  return {
    getSummary: async (_request, response) => {
      const snapshot = await githubService.getSummary()

      sendCacheablePublicJson(response, {
        success: true,
        message: 'GitHub summary retrieved successfully.',
        data: serializePublicGitHubSummary(snapshot),
      })
    },
  }
}
