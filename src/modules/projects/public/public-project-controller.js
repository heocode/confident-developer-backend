import { serializePublicProject } from './public-project-serializer.js'
import { sendCacheablePublicJson } from '../../../utils/public-response.js'

export function createPublicProjectController({ projectService, mediaService }) {
  return {
    list: async (request, response) => {
      const projects = await projectService.listProjects(request.validated.query)

      sendCacheablePublicJson(response, {
        success: true,
        message: 'Projects retrieved successfully.',
        data: projects.map((project) => serializePublicProject(project, { mediaService })),
      })
    },

    getBySlug: async (request, response) => {
      const project = await projectService.getProjectBySlug(request.validated.params.slug)

      sendCacheablePublicJson(response, {
        success: true,
        message: 'Project retrieved successfully.',
        data: serializePublicProject(project, { includeDetails: true, mediaService }),
      })
    },
  }
}
