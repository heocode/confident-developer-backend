import { serializeAdminProject } from './admin-project-serializer.js'

export function createAdminProjectController({ projectService }) {
  return {
    create: async (request, response) => {
      const project = await projectService.createProject(request.validated.body)

      response.status(201).json({
        success: true,
        message: 'Project created successfully.',
        data: serializeAdminProject(project),
      })
    },

    list: async (request, response) => {
      const projects = await projectService.listProjects(request.validated.query)

      response.json({
        success: true,
        message: 'Projects retrieved successfully.',
        data: projects.map(serializeAdminProject),
      })
    },

    getById: async (request, response) => {
      const project = await projectService.getProject(request.validated.params.id)

      response.json({
        success: true,
        message: 'Project retrieved successfully.',
        data: serializeAdminProject(project),
      })
    },

    update: async (request, response) => {
      const project = await projectService.updateProject(request.validated.params.id, request.validated.body)

      response.json({
        success: true,
        message: 'Project updated successfully.',
        data: serializeAdminProject(project),
      })
    },

    delete: async (request, response) => {
      await projectService.deleteProject(request.validated.params.id)

      response.json({
        success: true,
        message: 'Project deleted successfully.',
      })
    },
  }
}
