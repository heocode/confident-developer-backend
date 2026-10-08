import createError from 'http-errors'

import { PortfolioProject } from '../portfolio-project.js'

const PUBLIC_PROJECT_FIELDS = [
  '_id',
  'slug',
  'title',
  'tagline',
  'summary',
  'position',
  'themeColor',
  'timeline',
  'home.featured',
  'home.primary',
  'buildBreakdown',
  'links',
  'logoAsset',
  'homePreviewAsset',
]

const PUBLIC_MEDIA_FIELDS = '_id provider secureUrl width height alt'

function publicMediaPopulation(path) {
  return {
    path,
    match: { status: 'active' },
    select: PUBLIC_MEDIA_FIELDS,
  }
}

function prepareQuery(query, { fields, population, sort }) {
  query.select(fields.join(' '))

  for (const populate of population) query.populate(populate)
  if (sort) query.sort(sort)

  return query.lean()
}

export function createPublicProjectService({ projectModel = PortfolioProject } = {}) {
  return {
    async listProjects({ placement } = {}) {
      const isHomePlacement = placement === 'home'
      const filter = {
        status: 'published',
        ...(isHomePlacement ? { 'home.featured': true } : {}),
      }
      const sort = isHomePlacement
        ? { 'home.order': 1, _id: 1 }
        : { projectsPageOrder: 1, _id: 1 }
      const projects = await prepareQuery(projectModel.find(filter), {
        fields: PUBLIC_PROJECT_FIELDS,
        population: [publicMediaPopulation('logoAsset'), publicMediaPopulation('homePreviewAsset')],
        sort,
      })

      return projects.filter(
        (project) => project.logoAsset && (!project.home?.featured || project.homePreviewAsset),
      )
    },

    async getProjectBySlug(slug) {
      const project = await prepareQuery(projectModel.findOne({ slug, status: 'published' }), {
        fields: [...PUBLIC_PROJECT_FIELDS, 'scope', 'screenshots'],
        population: [
          publicMediaPopulation('logoAsset'),
          publicMediaPopulation('homePreviewAsset'),
          publicMediaPopulation('screenshots.asset'),
        ],
      })

      const hasAllScreenshots = project?.screenshots?.length > 0 && project.screenshots.every(({ asset }) => asset)
      const hasRequiredHomePreview = !project?.home?.featured || project.homePreviewAsset
      if (!project?.logoAsset || !hasAllScreenshots || !hasRequiredHomePreview) {
        throw createError(404, 'Project not found')
      }

      return project
    },
  }
}
