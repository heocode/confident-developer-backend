import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import createError from 'http-errors'
import mongoose from 'mongoose'

import { createApp } from '../../../src/app.js'
import { loadEnvironment } from '../../../src/config/environment.js'
import { createPublicProjectService } from '../../../src/modules/projects/public/public-project-service.js'

const projectId = '68e6c0000000000000000001'
const logoId = '68e6c0000000000000000002'
const previewId = '68e6c0000000000000000003'
const screenshotAssetId = '68e6c0000000000000000004'
const breakdownIds = ['68e6c0000000000000000011', '68e6c0000000000000000012']
const linkIds = ['68e6c0000000000000000021', '68e6c0000000000000000022']
const screenshotIds = ['68e6c0000000000000000031', '68e6c0000000000000000032']

function mediaAsset(id, alt) {
  return {
    _id: new mongoose.Types.ObjectId(id),
    provider: 'cloudinary',
    providerAssetId: `private-${id}`,
    secureUrl: `https://res.cloudinary.com/example/image/upload/${id}.webp`,
    width: 1600,
    height: 900,
    alt,
    status: 'active',
  }
}

function publicProject(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(projectId),
    slug: 'unicon',
    title: 'Unicon',
    tagline: 'Campus networking for verified students',
    summary: 'Designed and built from the ground up.',
    scope: 'Product design and full-stack development.',
    position: 'Founder & Developer',
    themeColor: '#3F6EB5',
    status: 'published',
    timeline: {
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: null,
    },
    home: { featured: true, primary: true, order: 1 },
    projectsPageOrder: 2,
    buildBreakdown: [
      { _id: new mongoose.Types.ObjectId(breakdownIds[0]), label: 'Development', percentage: 100 },
      { _id: new mongoose.Types.ObjectId(breakdownIds[1]), label: 'Product Design', percentage: 90 },
    ],
    links: [
      {
        _id: new mongoose.Types.ObjectId(linkIds[0]),
        icon: 'website',
        label: 'Website',
        url: 'https://example.com',
      },
      {
        _id: new mongoose.Types.ObjectId(linkIds[1]),
        icon: 'github',
        label: 'GitHub',
        url: 'https://github.com/example',
      },
    ],
    logoAsset: mediaAsset(logoId, 'Unicon logo'),
    homePreviewAsset: mediaAsset(previewId, 'Unicon Home preview'),
    screenshots: [
      {
        _id: new mongoose.Types.ObjectId(screenshotIds[0]),
        asset: mediaAsset(screenshotAssetId, 'Default screenshot alt'),
        alt: 'Unicon dashboard',
      },
      {
        _id: new mongoose.Types.ObjectId(screenshotIds[1]),
        asset: mediaAsset(screenshotAssetId, 'Default screenshot alt'),
        alt: 'Unicon profile',
      },
    ],
    publishedAt: new Date('2026-10-07T12:00:00.000Z'),
    createdAt: new Date('2026-10-01T12:00:00.000Z'),
    updatedAt: new Date('2026-10-07T12:00:00.000Z'),
    ...overrides,
  }
}

async function requestJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`)
  const body = await response.json()
  return { response, body }
}

describe('public project HTTP contract', () => {
  let baseUrl
  let server
  let calls

  const publicProjectService = {
    async listProjects(query) {
      calls.list.push(query)
      return [publicProject()]
    },
    async getProjectBySlug(slug) {
      calls.detail.push(slug)
      if (slug !== 'unicon') throw createError(404, 'Project not found')
      return publicProject()
    },
  }
  const mediaService = {
    createDeliveryUrl(asset, preset) {
      return `${asset.secureUrl}?preset=${preset}`
    },
  }

  before(async () => {
    const environment = loadEnvironment({ NODE_ENV: 'test' })
    const app = createApp({ environment, publicProjectService, mediaService })

    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1')
      server.once('listening', resolve)
      server.once('error', reject)
    })

    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  beforeEach(() => {
    calls = { list: [], detail: [] }
  })

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('returns a cacheable public list with links and no internal fields', async () => {
    const { response, body } = await requestJson(baseUrl, '/api/v1/projects')

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'public, max-age=0, s-maxage=60, stale-while-revalidate=300')
    assert.equal(response.headers.get('cdn-cache-control'), 'max-age=60, stale-while-revalidate=300')
    assert.deepEqual(calls.list.at(-1), {})
    assert.equal(body.success, true)
    assert.equal(body.data.length, 1)
    assert.deepEqual(
      body.data[0].buildBreakdown.map(({ id, label }) => ({ id, label })),
      [
        { id: breakdownIds[0], label: 'Development' },
        { id: breakdownIds[1], label: 'Product Design' },
      ],
    )
    assert.deepEqual(
      body.data[0].links.map(({ id, icon }) => ({ id, icon })),
      [
        { id: linkIds[0], icon: 'website' },
        { id: linkIds[1], icon: 'github' },
      ],
    )
    assert.equal(body.data[0].logo.url.endsWith('?preset=logo'), true)
    assert.equal(body.data[0].homePreview.url.endsWith('?preset=homePreview'), true)
    assert.equal('scope' in body.data[0], false)
    assert.equal('screenshots' in body.data[0], false)

    for (const field of ['status', 'projectsPageOrder', 'publishedAt', 'createdAt', 'updatedAt', '_id', '__v']) {
      assert.equal(field in body.data[0], false)
    }
    assert.deepEqual(body.data[0].home, { featured: true, primary: true })
    assert.equal(JSON.stringify(body.data).includes('providerAssetId'), false)
    assert.equal(JSON.stringify(body.data).includes('private-'), false)
  })

  it('passes Home placement explicitly and preserves the common list contract', async () => {
    const { response, body } = await requestJson(baseUrl, '/api/v1/projects?placement=home')

    assert.equal(response.status, 200)
    assert.deepEqual(calls.list.at(-1), { placement: 'home' })
    assert.equal(body.data[0].home.primary, true)
    assert.equal(body.data[0].links.length, 2)
  })

  it('returns slug detail with ordered screenshots and their contextual alt text', async () => {
    const { response, body } = await requestJson(baseUrl, '/api/v1/projects/unicon')

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'public, max-age=0, s-maxage=60, stale-while-revalidate=300')
    assert.equal(calls.detail.at(-1), 'unicon')
    assert.equal(body.data.scope, 'Product design and full-stack development.')
    assert.deepEqual(
      body.data.screenshots.map(({ id, alt }) => ({ id, alt })),
      [
        { id: screenshotIds[0], alt: 'Unicon dashboard' },
        { id: screenshotIds[1], alt: 'Unicon profile' },
      ],
    )
    assert.equal(body.data.screenshots.every(({ url }) => url.endsWith('?preset=screenshot')), true)
    assert.notEqual(body.data.screenshots[0].id, screenshotAssetId)
  })

  it('rejects invalid input and never caches validation or not-found responses', async () => {
    const invalidPlacement = await requestJson(baseUrl, '/api/v1/projects?placement=archive')
    assert.equal(invalidPlacement.response.status, 400)
    assert.equal(invalidPlacement.response.headers.get('cache-control'), null)

    const unknownQuery = await requestJson(baseUrl, '/api/v1/projects?unexpected=true')
    assert.equal(unknownQuery.response.status, 400)
    assert.equal(unknownQuery.response.headers.get('cache-control'), null)

    const malformedSlug = await requestJson(baseUrl, '/api/v1/projects/Invalid_Slug')
    assert.equal(malformedSlug.response.status, 400)
    assert.equal(malformedSlug.response.headers.get('cache-control'), null)

    const missing = await requestJson(baseUrl, '/api/v1/projects/missing-project')
    assert.equal(missing.response.status, 404)
    assert.equal(missing.response.headers.get('cache-control'), null)
    assert.deepEqual(missing.body, { success: false, message: 'Project not found' })
  })
})

function createQueryHarness(result) {
  const state = { select: undefined, populate: [], sort: undefined }
  const query = {
    select(fields) {
      state.select = fields
      return this
    },
    populate(specification) {
      state.populate.push(specification)
      return this
    },
    sort(specification) {
      state.sort = specification
      return this
    },
    lean() {
      return Promise.resolve(result)
    },
  }

  return { query, state }
}

describe('public project service', () => {
  it('filters and sorts published Archive and Home projects deterministically', async () => {
    const queries = []
    const projectModel = {
      find(filter) {
        const harness = createQueryHarness([publicProject()])
        queries.push({ filter, ...harness })
        return harness.query
      },
    }
    const service = createPublicProjectService({ projectModel })

    await service.listProjects({})
    await service.listProjects({ placement: 'home' })

    assert.deepEqual(queries[0].filter, { status: 'published' })
    assert.deepEqual(queries[0].state.sort, { projectsPageOrder: 1, _id: 1 })
    assert.deepEqual(queries[1].filter, { status: 'published', 'home.featured': true })
    assert.deepEqual(queries[1].state.sort, { 'home.order': 1, _id: 1 })
    assert.equal(queries[0].state.select.includes('status'), false)
    assert.equal(queries[0].state.select.includes('projectsPageOrder'), false)
    assert.deepEqual(
      queries[0].state.populate.map(({ path }) => path),
      ['logoAsset', 'homePreviewAsset'],
    )
  })

  it('loads detail only by published slug with exact media population', async () => {
    const harness = createQueryHarness(publicProject())
    let filter
    const projectModel = {
      findOne(value) {
        filter = value
        return harness.query
      },
    }
    const service = createPublicProjectService({ projectModel })

    const project = await service.getProjectBySlug('unicon')

    assert.equal(project.slug, 'unicon')
    assert.deepEqual(filter, { slug: 'unicon', status: 'published' })
    assert.equal(harness.state.select.includes('scope'), true)
    assert.equal(harness.state.select.includes('screenshots'), true)
    assert.deepEqual(
      harness.state.populate.map(({ path }) => path),
      ['logoAsset', 'homePreviewAsset', 'screenshots.asset'],
    )
    assert.equal(harness.state.populate.every(({ match }) => match.status === 'active'), true)
    assert.equal(harness.state.populate.every(({ select }) => !select.includes('providerAssetId')), true)
  })

  it('hides missing, draft, and media-incomplete detail records behind the same 404', async () => {
    for (const result of [
      null,
      publicProject({ logoAsset: null }),
      publicProject({ homePreviewAsset: null }),
      publicProject({ screenshots: [] }),
    ]) {
      const { query } = createQueryHarness(result)
      const service = createPublicProjectService({ projectModel: { findOne: () => query } })

      await assert.rejects(
        service.getProjectBySlug('hidden-project'),
        (error) => error.status === 404 && error.message === 'Project not found',
      )
    }
  })
})
