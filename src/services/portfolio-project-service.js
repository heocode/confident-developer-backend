import mongoose from 'mongoose'
import createError from 'http-errors'

import { MediaAsset } from '../models/media-asset.js'
import { PortfolioProject } from '../models/portfolio-project.js'

const MAX_PUBLISHED_FEATURED_PROJECTS = 3

async function runInMongoTransaction(operation) {
  const session = await mongoose.startSession()

  try {
    return await session.withTransaction(() => operation(session))
  } finally {
    await session.endSession()
  }
}

function useSession(query, session) {
  return session && typeof query?.session === 'function' ? query.session(session) : query
}

function documentValue(value) {
  return typeof value?.toObject === 'function' ? value.toObject() : value
}

function mergeNested(current, patch) {
  return { ...(documentValue(current) ?? {}), ...patch }
}

function applyProjectPatch(project, patch) {
  const { timeline, home, ...fields } = patch
  project.set(fields)

  if (Object.hasOwn(patch, 'timeline')) {
    project.set('timeline', timeline === null ? null : mergeNested(project.timeline, timeline))
  }

  if (Object.hasOwn(patch, 'home')) {
    project.set('home', mergeNested(project.home, home))
  }
}

function collectMediaAssetIds(project) {
  const ids = [project.logoAsset, project.homePreviewAsset, ...project.screenshots.map(({ asset }) => asset)]
    .filter(Boolean)
    .map((id) => id.toString())

  return [...new Set(ids)]
}

export function createPortfolioProjectService({
  projectModel = PortfolioProject,
  mediaAssetModel = MediaAsset,
  runInTransaction = runInMongoTransaction,
  now = () => new Date(),
} = {}) {
  async function validateMediaAssets(project, session) {
    const assetIds = collectMediaAssetIds(project)
    if (assetIds.length === 0) return

    const query = mediaAssetModel.countDocuments({
      _id: { $in: assetIds },
      status: 'active',
    })
    const activeAssetCount = await useSession(query, session)

    if (activeAssetCount !== assetIds.length) {
      throw createError(409, 'One or more media assets are missing or inactive')
    }
  }

  async function enforceFeaturedLimit(project, session) {
    if (project.status !== 'published' || !project.home.featured) return

    const query = projectModel.countDocuments({
      _id: { $ne: project._id },
      status: 'published',
      'home.featured': true,
    })
    const otherFeaturedProjects = await useSession(query, session)

    if (otherFeaturedProjects >= MAX_PUBLISHED_FEATURED_PROJECTS) {
      throw createError(409, `Home cannot contain more than ${MAX_PUBLISHED_FEATURED_PROJECTS} featured projects`)
    }
  }

  async function replacePublishedPrimary(project, session) {
    if (project.status !== 'published' || !project.home.primary) return

    await projectModel.updateMany(
      {
        _id: { $ne: project._id },
        status: 'published',
        'home.primary': true,
      },
      { $set: { 'home.primary': false } },
      { session },
    )
  }

  async function validateAndSave(project, session) {
    if (project.status === 'published' && !project.publishedAt) {
      project.publishedAt = now()
    }

    await project.validate()
    await validateMediaAssets(project, session)
    await enforceFeaturedLimit(project, session)
    await replacePublishedPrimary(project, session)
    await project.save({ session })

    return project
  }

  return {
    async createProject(input) {
      return runInTransaction(async (session) => {
        const project = new projectModel(input)
        return validateAndSave(project, session)
      })
    },

    async listProjects({ status } = {}) {
      const filter = status ? { status } : {}
      return projectModel.find(filter).sort({ createdAt: -1, _id: -1 })
    },

    async getProject(projectId) {
      const project = await projectModel.findById(projectId)
      if (!project) throw createError(404, 'Project not found')
      return project
    },

    async updateProject(projectId, input) {
      return runInTransaction(async (session) => {
        const project = await useSession(projectModel.findById(projectId), session)
        if (!project) throw createError(404, 'Project not found')

        applyProjectPatch(project, input)
        return validateAndSave(project, session)
      })
    },

    async deleteProject(projectId) {
      const project = await projectModel.findByIdAndDelete(projectId)
      if (!project) throw createError(404, 'Project not found')
    },
  }
}
