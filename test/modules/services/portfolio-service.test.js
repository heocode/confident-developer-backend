import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { PortfolioService } from '../../../src/modules/services/portfolio-service.js'

const projectId = '68e7a0000000000000000010'
const showcaseAssetIds = [1, 2, 3, 4, 5].map(
  (suffix) => `68e7a00000000000000000${10 + suffix}`,
)

function hasIndex(model, fields, expectedOptions = {}) {
  return model.schema.indexes().some(([indexFields, options]) => {
    const fieldsMatch = JSON.stringify(indexFields) === JSON.stringify(fields)
    const optionsMatch = Object.entries(expectedOptions).every(
      ([key, value]) => JSON.stringify(options[key]) === JSON.stringify(value),
    )
    return fieldsMatch && optionsMatch
  })
}

function publishedService(overrides = {}) {
  return new PortfolioService({
    slug: 'mobile-development',
    title: 'Mobile Development',
    description: 'Building smooth, reliable mobile experiences.',
    icon: 'mobile-development',
    tone: 'mobile',
    capabilities: ['Mobile Apps', 'API Integration'],
    tools: [
      { key: 'react', label: 'React' },
      { key: 'typescript', label: 'TypeScript' },
      { key: 'expo', label: 'Expo' },
    ],
    relatedProjects: [projectId],
    showcaseAssets: showcaseAssetIds,
    status: 'published',
    publishedAt: '2026-10-14T12:00:00.000Z',
    ...overrides,
  })
}

describe('PortfolioService model', () => {
  it('stores incomplete drafts in an isolated production collection', async () => {
    const service = new PortfolioService({ slug: 'future-service', title: 'Future Service' })

    await service.validate()

    assert.equal(PortfolioService.collection.collectionName, 'portfolio_services')
    assert.equal(service.status, 'draft')
    assert.deepEqual(service.home.toObject(), { featured: false, order: 0 })
    assert.equal(service.servicesPageOrder, 0)
    assert.deepEqual(service.capabilities, [])
    assert.deepEqual(service.tools, [])
    assert.deepEqual(service.relatedProjects, [])
    assert.deepEqual(service.showcaseAssets, [])
  })

  it('accepts the allowlisted presentation keys for a published service', async () => {
    const service = publishedService({ home: { featured: true, order: 2 } })

    await service.validate()

    assert.equal(service.icon, 'mobile-development')
    assert.equal(service.tone, 'mobile')
    assert.deepEqual(service.home.toObject(), { featured: true, order: 2 })
  })

  it('requires complete public content before publication', async () => {
    const service = new PortfolioService({
      slug: 'incomplete',
      title: 'Incomplete',
      status: 'published',
    })

    await assert.rejects(service.validate(), (error) => {
      assert.equal(error.name, 'ValidationError')
      assert.ok(error.errors.description)
      assert.ok(error.errors.icon)
      assert.ok(error.errors.tone)
      assert.ok(error.errors.capabilities)
      assert.ok(error.errors.tools)
      assert.ok(error.errors.relatedProjects)
      assert.ok(error.errors.showcaseAssets)
      assert.ok(error.errors.publishedAt)
      return true
    })
  })

  it('rejects duplicate ordered content and incomplete showcase media', async () => {
    const service = publishedService({
      capabilities: ['API Integration', 'api integration'],
      tools: [
        { key: 'react', label: 'React' },
        { key: 'react', label: 'React duplicate' },
      ],
      relatedProjects: [projectId, projectId],
      showcaseAssets: showcaseAssetIds.slice(0, 4),
    })

    await assert.rejects(service.validate(), (error) => {
      assert.ok(error.errors.capabilities)
      assert.ok(error.errors.tools)
      assert.ok(error.errors.relatedProjects)
      assert.ok(error.errors.showcaseAssets)
      return true
    })
  })

  it('rejects invalid slugs, presentation keys, and ordering values', async () => {
    const service = new PortfolioService({
      slug: 'Invalid Slug',
      title: 'Invalid',
      icon: 'remote-svg-path',
      tone: 'orange',
      home: { order: 1.5 },
      servicesPageOrder: -1,
    })

    await assert.rejects(service.validate(), (error) => {
      assert.ok(error.errors.slug)
      assert.ok(error.errors.icon)
      assert.ok(error.errors.tone)
      assert.ok(error.errors['home.order'])
      assert.ok(error.errors.servicesPageOrder)
      return true
    })
  })

  it('defines deterministic public ordering and slug uniqueness indexes', () => {
    assert.equal(hasIndex(PortfolioService, { slug: 1 }, { unique: true }), true)
    assert.equal(hasIndex(PortfolioService, { status: 1, servicesPageOrder: 1, _id: 1 }), true)
    assert.equal(
      hasIndex(PortfolioService, { status: 1, 'home.featured': 1, 'home.order': 1, _id: 1 }),
      true,
    )
  })
})
