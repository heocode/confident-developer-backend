import { serializePublicProject } from './public-project-serializer.js'

const PUBLIC_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
const PUBLIC_CDN_CACHE_CONTROL = 'max-age=60, stale-while-revalidate=300'

function sendCacheableJson(response, body) {
  response
    .set('Cache-Control', PUBLIC_CACHE_CONTROL)
    .set('CDN-Cache-Control', PUBLIC_CDN_CACHE_CONTROL)
    .json(body)
}

export function createPublicProjectController({ projectService, mediaService }) {
  return {
    list: async (request, response) => {
      const projects = await projectService.listProjects(request.validated.query)

      sendCacheableJson(response, {
        success: true,
        message: 'Projects retrieved successfully.',
        data: projects.map((project) => serializePublicProject(project, { mediaService })),
      })
    },

    getBySlug: async (request, response) => {
      const project = await projectService.getProjectBySlug(request.validated.params.slug)

      sendCacheableJson(response, {
        success: true,
        message: 'Project retrieved successfully.',
        data: serializePublicProject(project, { includeDetails: true, mediaService }),
      })
    },
  }
}
