import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import mongoose from 'mongoose'

import { createApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/environment.js'
import { createAdminProjectService } from '../src/modules/projects/admin/admin-project-service.js'
import { serializeAdminProject } from '../src/modules/projects/admin/admin-project-serializer.js'
import { PortfolioProject } from '../src/modules/projects/portfolio-project.js'

const frontendOrigin = 'http://localhost:5173'
const sessionCookie = 'cd_admin_session=project-session-token'
const projectId = '68e6a0000000000000000001'
const assetId = '68e6a0000000000000000002'

function projectData(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(projectId),
    slug: 'unicon',
    title: 'Unicon',
    status: 'draft',
    home: { featured: false, primary: false, order: 0 },
    projectsPageOrder: 0,
    buildBreakdown: [],
    links: [],
    screenshots: [],
    createdAt: new Date('2026-10-07T12:00:00.000Z'),
    updatedAt: new Date('2026-10-07T12:00:00.000Z'),
    ...overrides,
  }
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const body = await response.json()
  return { response, body }
}

describe('admin project HTTP contract', () => {
  let baseUrl
  let server
  let calls

  const authService = {
    async getAdminForToken(token) {
      if (token !== 'project-session-token') {
        const error = new Error('Authentication required')
        error.status = 401
        throw error
      }

      return { id: 'admin-id', displayName: 'Owner', email: 'owner@example.com' }
    },
  }

  const projectService = {
    async createProject(input) {
      calls.create.push(input)
      return projectData({ ...input, themeColor: input.themeColor?.toUpperCase() })
    },
    async listProjects(query) {
      calls.list.push(query)
      return [projectData()]
    },
    async getProject(id) {
      calls.get.push(id)
      return projectData()
    },
    async updateProject(id, input) {
      calls.update.push({ id, input })
      return projectData({ ...input, updatedAt: new Date('2026-10-08T12:00:00.000Z') })
    },
    async deleteProject(id) {
      calls.delete.push(id)
    },
  }

  before(async () => {
    const environment = loadEnvironment({
      NODE_ENV: 'test',
      CLIENT_ORIGINS: frontendOrigin,
    })
    const app = createApp({ environment, authService, projectService })

    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1')
      server.once('listening', resolve)
      server.once('error', reject)
    })

    const address = server.address()
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  before(() => {
    calls = { create: [], list: [], get: [], update: [], delete: [] }
  })

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('requires an admin session and a trusted origin for writes', async () => {
    const unauthenticated = await requestJson(baseUrl, '/api/v1/admin/projects')
    assert.equal(unauthenticated.response.status, 401)

    const missingOrigin = await requestJson(baseUrl, '/api/v1/admin/projects', {
      method: 'POST',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'unicon', title: 'Unicon' }),
    })
    assert.equal(missingOrigin.response.status, 403)
    assert.deepEqual(missingOrigin.body, { success: false, message: 'Trusted origin is required' })
  })

  it('creates a draft and returns an explicit admin representation', async () => {
    const { response, body } = await requestJson(baseUrl, '/api/v1/admin/projects', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
        origin: frontendOrigin,
      },
      body: JSON.stringify({ slug: 'unicon', title: 'Unicon', themeColor: '#3f6eb5' }),
    })

    assert.equal(response.status, 201)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(body.success, true)
    assert.equal(body.message, 'Project created successfully.')
    assert.equal(body.data.id, projectId)
    assert.equal(body.data.themeColor, '#3F6EB5')
    assert.equal('_id' in body.data, false)
    assert.equal('__v' in body.data, false)
    assert.deepEqual(calls.create.at(-1), {
      slug: 'unicon',
      title: 'Unicon',
      themeColor: '#3f6eb5',
    })
  })

  it('lists, retrieves, updates, and deletes projects', async () => {
    const list = await requestJson(baseUrl, '/api/v1/admin/projects?status=draft', {
      headers: { cookie: sessionCookie },
    })
    assert.equal(list.response.status, 200)
    assert.equal(list.body.data.length, 1)
    assert.deepEqual(calls.list.at(-1), { status: 'draft' })

    const get = await requestJson(baseUrl, `/api/v1/admin/projects/${projectId}`, {
      headers: { cookie: sessionCookie },
    })
    assert.equal(get.response.status, 200)
    assert.equal(get.body.data.id, projectId)

    const update = await requestJson(baseUrl, `/api/v1/admin/projects/${projectId}`, {
      method: 'PATCH',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
        origin: frontendOrigin,
      },
      body: JSON.stringify({
        title: 'Updated Unicon',
        timeline: { startDate: '2026-06-01', endDate: null },
        links: [
          {
            id: assetId,
            icon: 'website',
            label: 'Website',
            url: 'https://example.com',
          },
        ],
      }),
    })
    assert.equal(update.response.status, 200)
    assert.equal(update.body.data.title, 'Updated Unicon')
    assert.ok(calls.update.at(-1).input.timeline.startDate instanceof Date)
    assert.deepEqual(calls.update.at(-1).input.links, [
      {
        id: assetId,
        icon: 'website',
        label: 'Website',
        url: 'https://example.com',
      },
    ])

    const deletion = await requestJson(baseUrl, `/api/v1/admin/projects/${projectId}`, {
      method: 'DELETE',
      headers: { cookie: sessionCookie, origin: frontendOrigin },
    })
    assert.equal(deletion.response.status, 200)
    assert.deepEqual(deletion.body, {
      success: true,
      message: 'Project deleted successfully.',
    })
    assert.equal(calls.delete.at(-1), projectId)
  })

  it('rejects malformed IDs, empty patches, unsafe links, and server-owned fields', async () => {
    const malformedId = await requestJson(baseUrl, '/api/v1/admin/projects/not-an-id', {
      headers: { cookie: sessionCookie },
    })
    assert.equal(malformedId.response.status, 400)

    const emptyPatch = await requestJson(baseUrl, `/api/v1/admin/projects/${projectId}`, {
      method: 'PATCH',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
        origin: frontendOrigin,
      },
      body: '{}',
    })
    assert.equal(emptyPatch.response.status, 400)

    const invalidCreate = await requestJson(baseUrl, '/api/v1/admin/projects', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
        origin: frontendOrigin,
      },
      body: JSON.stringify({
        slug: 'unsafe',
        title: 'Unsafe',
        publishedAt: '2026-10-07T12:00:00.000Z',
        links: [{ icon: 'website', label: 'Website', url: 'http://example.com' }],
      }),
    })
    assert.equal(invalidCreate.response.status, 400)

    const clientControlledNestedId = await requestJson(baseUrl, '/api/v1/admin/projects', {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
        origin: frontendOrigin,
      },
      body: JSON.stringify({
        slug: 'client-id',
        title: 'Client ID',
        links: [{ id: projectId, icon: 'website', label: 'Website', url: 'https://example.com' }],
      }),
    })
    assert.equal(clientControlledNestedId.response.status, 400)

    const contradictoryHomeState = await requestJson(baseUrl, `/api/v1/admin/projects/${projectId}`, {
      method: 'PATCH',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
        origin: frontendOrigin,
      },
      body: JSON.stringify({ home: { featured: false, primary: true } }),
    })
    assert.equal(contradictoryHomeState.response.status, 400)

    const obsoleteScreenshotOrder = await requestJson(baseUrl, `/api/v1/admin/projects/${projectId}`, {
      method: 'PATCH',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
        origin: frontendOrigin,
      },
      body: JSON.stringify({ screenshots: [{ asset: assetId, alt: 'Dashboard', order: 1 }] }),
    })
    assert.equal(obsoleteScreenshotOrder.response.status, 400)
    assert.equal(calls.create.length, 1)
  })
})

describe('admin project serializer', () => {
  it('returns stable nested IDs and array order without persistence details', () => {
    const project = new PortfolioProject({
      slug: 'unicon',
      title: 'Unicon',
      buildBreakdown: [
        { label: 'Development', percentage: 100 },
        { label: 'Design', percentage: 90 },
      ],
      links: [{ icon: 'website', label: 'Website', url: 'https://example.com' }],
      screenshots: [{ asset: assetId, alt: 'Dashboard' }],
    })

    const serialized = serializeAdminProject(project)

    assert.deepEqual(
      serialized.buildBreakdown.map((item) => item.label),
      ['Development', 'Design'],
    )
    assert.equal(serialized.buildBreakdown.every((item) => /^[a-f\d]{24}$/.test(item.id)), true)
    assert.equal(serialized.links[0].icon, 'website')
    assert.match(serialized.links[0].id, /^[a-f\d]{24}$/)
    assert.match(serialized.screenshots[0].id, /^[a-f\d]{24}$/)
    assert.equal('order' in serialized.screenshots[0], false)
    assert.equal('_id' in serialized.screenshots[0], false)
  })
})

function sessionResult(value) {
  return {
    session() {
      return Promise.resolve(value)
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject)
    },
  }
}

function publishedFeaturedProject(overrides = {}) {
  return {
    slug: 'unicon',
    title: 'Unicon',
    tagline: 'A platform for verified students',
    summary: 'Designed and built from the ground up.',
    scope: 'Product design and full-stack development.',
    position: 'Founder & Developer',
    themeColor: '#3F6EB5',
    status: 'published',
    timeline: { startDate: new Date('2026-06-01T00:00:00.000Z') },
    home: { featured: true, primary: true, order: 0 },
    buildBreakdown: [{ label: 'Full-stack Development', percentage: 100 }],
    logoAsset: assetId,
    homePreviewAsset: assetId,
    screenshots: [{ asset: assetId, alt: 'Unicon feed' }],
    ...overrides,
  }
}

function createServiceHarness({ featuredCount = 0, activeAssetCount = 1, existingProject = null } = {}) {
  const state = {
    saved: [],
    primaryUpdates: [],
    deleted: [],
    findFilter: undefined,
    sort: undefined,
  }
  const session = { id: 'test-session' }

  function ProjectModel(values) {
    const project = new PortfolioProject(values)
    project.save = async (options) => {
      state.saved.push({ project, options })
      return project
    }
    return project
  }

  ProjectModel.countDocuments = () => sessionResult(featuredCount)
  ProjectModel.updateMany = async (...arguments_) => {
    state.primaryUpdates.push(arguments_)
  }
  ProjectModel.findById = () => sessionResult(existingProject)
  ProjectModel.findByIdAndDelete = async (id) => {
    state.deleted.push(id)
    return existingProject
  }
  ProjectModel.find = (filter) => {
    state.findFilter = filter
    return {
      sort(specification) {
        state.sort = specification
        return Promise.resolve(existingProject ? [existingProject] : [])
      },
    }
  }

  const mediaAssetModel = {
    countDocuments() {
      return sessionResult(activeAssetCount)
    },
  }

  const service = createAdminProjectService({
    projectModel: ProjectModel,
    mediaAssetModel,
    runInTransaction: (operation) => operation(session),
    now: () => new Date('2026-10-07T15:00:00.000Z'),
  })

  return { service, state, session }
}

describe('admin project service', () => {
  it('publishes with active media, assigns publishedAt, and replaces the prior primary', async () => {
    const { service, state, session } = createServiceHarness({ featuredCount: 2 })

    const project = await service.createProject(publishedFeaturedProject())

    assert.equal(project.publishedAt.toISOString(), '2026-10-07T15:00:00.000Z')
    assert.equal(state.saved.length, 1)
    assert.equal(state.saved[0].options.session, session)
    assert.equal(state.primaryUpdates.length, 1)
    assert.deepEqual(state.primaryUpdates[0][1], { $set: { 'home.primary': false } })
    assert.equal(state.primaryUpdates[0][2].session, session)
  })

  it('rejects a fourth published featured project', async () => {
    const { service, state } = createServiceHarness({ featuredCount: 3 })

    await assert.rejects(service.createProject(publishedFeaturedProject()), (error) => {
      assert.equal(error.status, 409)
      assert.equal(error.message, 'Home cannot contain more than 3 featured projects')
      return true
    })
    assert.equal(state.saved.length, 0)
  })

  it('rejects missing or inactive referenced media', async () => {
    const { service, state } = createServiceHarness({ activeAssetCount: 0 })

    await assert.rejects(service.createProject(publishedFeaturedProject()), (error) => {
      assert.equal(error.status, 409)
      assert.equal(error.message, 'One or more media assets are missing or inactive')
      return true
    })
    assert.equal(state.saved.length, 0)
  })

  it('merges nested patches without discarding existing Home placement', async () => {
    const existingProject = new PortfolioProject({
      slug: 'unicon',
      title: 'Unicon',
      home: { featured: true, primary: false, order: 2 },
    })
    existingProject.save = async () => existingProject
    const { service } = createServiceHarness({ existingProject, activeAssetCount: 0 })

    const updated = await service.updateProject(existingProject.id, { home: { primary: true } })

    assert.deepEqual(updated.home.toObject(), { featured: true, primary: true, order: 2 })
  })

  it('turns off primary automatically when a project is removed from Home', async () => {
    const existingProject = new PortfolioProject({
      slug: 'unicon',
      title: 'Unicon',
      home: { featured: true, primary: true, order: 2 },
    })
    existingProject.save = async () => existingProject
    const { service } = createServiceHarness({ existingProject, activeAssetCount: 0 })

    const updated = await service.updateProject(existingProject.id, { home: { featured: false } })

    assert.deepEqual(updated.home.toObject(), { featured: false, primary: false, order: 2 })
  })

  it('rejects an explicit primary state when featured is false', async () => {
    const existingProject = new PortfolioProject({ slug: 'unicon', title: 'Unicon' })
    existingProject.save = async () => existingProject
    const { service } = createServiceHarness({ existingProject, activeAssetCount: 0 })

    await assert.rejects(
      service.updateProject(existingProject.id, { home: { featured: false, primary: true } }),
      (error) => error.status === 400 && error.message === 'Primary projects must also be featured',
    )
  })

  it('preserves nested item identifiers while atomically saving their new order', async () => {
    const sharedAssetId = new mongoose.Types.ObjectId(assetId)
    const replacementAssetId = new mongoose.Types.ObjectId()
    const existingProject = new PortfolioProject({
      slug: 'unicon',
      title: 'Unicon',
      buildBreakdown: [
        { label: 'Design', percentage: 90 },
        { label: 'Development', percentage: 100 },
      ],
      links: [
        { icon: 'website', label: 'Website', url: 'https://example.com' },
        { icon: 'github', label: 'GitHub', url: 'https://github.com/example' },
      ],
      screenshots: [
        { asset: sharedAssetId, alt: 'Dashboard' },
        { asset: sharedAssetId, alt: 'Profile' },
      ],
    })
    existingProject.save = async () => existingProject
    const originalIds = {
      breakdown: existingProject.buildBreakdown.map((item) => item.id),
      links: existingProject.links.map((item) => item.id),
      screenshots: existingProject.screenshots.map((item) => item.id),
    }
    const { service } = createServiceHarness({ existingProject })

    const updated = await service.updateProject(existingProject.id, {
      buildBreakdown: [
        { id: originalIds.breakdown[1], label: 'Development', percentage: 100 },
        { id: originalIds.breakdown[0], label: 'Product Design', percentage: 95 },
      ],
      links: [
        {
          id: originalIds.links[1],
          icon: 'github',
          label: 'Source code',
          url: 'https://github.com/example',
        },
        { id: originalIds.links[0], icon: 'website', label: 'Website', url: 'https://example.com' },
      ],
      screenshots: [
        { id: originalIds.screenshots[1], asset: replacementAssetId.toString(), alt: 'Profile screen' },
        { id: originalIds.screenshots[0], asset: replacementAssetId.toString(), alt: 'Dashboard screen' },
      ],
    })

    assert.deepEqual(
      updated.buildBreakdown.map((item) => item.id),
      originalIds.breakdown.toReversed(),
    )
    assert.deepEqual(
      updated.links.map((item) => item.id),
      originalIds.links.toReversed(),
    )
    assert.deepEqual(
      updated.screenshots.map((item) => item.id),
      originalIds.screenshots.toReversed(),
    )
    assert.equal(updated.buildBreakdown[1].label, 'Product Design')
    assert.equal(updated.screenshots[0].alt, 'Profile screen')
    assert.equal(updated.screenshots[0].asset.toString(), replacementAssetId.toString())
  })

  it('adds new ordered items and removes omitted items without changing retained IDs', async () => {
    const existingProject = new PortfolioProject({
      slug: 'unicon',
      title: 'Unicon',
      buildBreakdown: [
        { label: 'Design', percentage: 90 },
        { label: 'Development', percentage: 100 },
      ],
    })
    existingProject.save = async () => existingProject
    const retainedId = existingProject.buildBreakdown[1].id
    const removedId = existingProject.buildBreakdown[0].id
    const { service } = createServiceHarness({ existingProject, activeAssetCount: 0 })

    const updated = await service.updateProject(existingProject.id, {
      buildBreakdown: [
        { id: retainedId, label: 'Development', percentage: 100 },
        { label: 'Operations', percentage: 80 },
      ],
    })

    assert.equal(updated.buildBreakdown[0].id, retainedId)
    assert.notEqual(updated.buildBreakdown[1].id, retainedId)
    assert.equal(updated.buildBreakdown.some((item) => item.id === removedId), false)
  })

  it('rejects duplicate and unknown identifiers in ordered project content', async () => {
    const existingProject = new PortfolioProject({
      slug: 'unicon',
      title: 'Unicon',
      links: [{ icon: 'website', label: 'Website', url: 'https://example.com' }],
    })
    existingProject.save = async () => existingProject
    const existingLinkId = existingProject.links[0].id
    const { service } = createServiceHarness({ existingProject, activeAssetCount: 0 })

    await assert.rejects(
      service.updateProject(existingProject.id, {
        links: [
          { id: existingLinkId, icon: 'website', label: 'Website', url: 'https://example.com' },
          { id: existingLinkId, icon: 'github', label: 'GitHub', url: 'https://github.com/example' },
        ],
      }),
      (error) => error.status === 400 && error.message === 'Duplicate links item ID',
    )

    await assert.rejects(
      service.updateProject(existingProject.id, {
        links: [
          {
            id: new mongoose.Types.ObjectId().toString(),
            icon: 'website',
            label: 'Website',
            url: 'https://example.com',
          },
        ],
      }),
      (error) => error.status === 400 && error.message === 'Unknown links item ID',
    )
  })

  it('uses deterministic admin ordering and deletes only the project document', async () => {
    const existingProject = new PortfolioProject({ slug: 'unicon', title: 'Unicon' })
    const { service, state } = createServiceHarness({ existingProject })

    const projects = await service.listProjects({ status: 'draft' })
    await service.deleteProject(existingProject.id)

    assert.equal(projects[0], existingProject)
    assert.deepEqual(state.findFilter, { status: 'draft' })
    assert.deepEqual(state.sort, { createdAt: -1, _id: -1 })
    assert.deepEqual(state.deleted, [existingProject.id])
  })

  it('returns not found errors for missing project records', async () => {
    const { service } = createServiceHarness()

    await assert.rejects(service.getProject(projectId), (error) => error.status === 404)
    await assert.rejects(service.updateProject(projectId, { title: 'Missing' }), (error) => error.status === 404)
    await assert.rejects(service.deleteProject(projectId), (error) => error.status === 404)
  })
})
