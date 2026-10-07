import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import mongoose from 'mongoose'

import { MediaAsset } from '../src/models/media-asset.js'
import { PortfolioProject } from '../src/models/portfolio-project.js'

function hasIndex(model, fields, expectedOptions = {}) {
  return model.schema.indexes().some(([indexFields, options]) => {
    const fieldsMatch = JSON.stringify(indexFields) === JSON.stringify(fields)
    const optionsMatch = Object.entries(expectedOptions).every(
      ([key, value]) => JSON.stringify(options[key]) === JSON.stringify(value),
    )
    return fieldsMatch && optionsMatch
  })
}

function publishedProject(overrides = {}) {
  const logoAsset = new mongoose.Types.ObjectId()
  const screenshotAsset = new mongoose.Types.ObjectId()

  return new PortfolioProject({
    slug: 'unicon',
    title: 'Unicon',
    scope: 'A campus networking platform for verified students.',
    position: 'Founder & Developer',
    themeColor: '#3f6eb5',
    status: 'published',
    timeline: { startDate: '2026-06-01', endDate: null },
    projectsPageOrder: 1,
    logoAsset,
    screenshots: [{ asset: screenshotAsset, alt: 'Unicon home feed', order: 0 }],
    publishedAt: '2026-10-07',
    ...overrides,
  })
}

describe('PortfolioProject model', () => {
  it('stores incomplete drafts in an isolated production collection', async () => {
    const project = new PortfolioProject({ slug: 'future-project', title: 'Future Project' })

    await project.validate()

    assert.equal(PortfolioProject.collection.collectionName, 'portfolio_projects')
    assert.equal(project.status, 'draft')
    assert.deepEqual(project.home.toObject(), { featured: false, primary: false, order: 0 })
    assert.equal(project.projectsPageOrder, 0)
    assert.deepEqual(project.buildBreakdown, [])
    assert.deepEqual(project.links, [])
    assert.deepEqual(project.screenshots, [])
  })

  it('normalizes a project color and accepts independent breakdown percentages', async () => {
    const project = publishedProject({
      tagline: 'Campus networking for verified students',
      summary: 'Designed and built from the ground up.',
      home: { featured: true, primary: true, order: 1 },
      homePreviewAsset: new mongoose.Types.ObjectId(),
      buildBreakdown: [
        { label: 'Product Design', percentage: 100 },
        { label: 'Backend Development', percentage: 100 },
        { label: 'Launch & Operations', percentage: 80 },
      ],
    })

    await project.validate()

    assert.equal(project.themeColor, '#3F6EB5')
    assert.deepEqual(
      project.buildBreakdown.map(({ percentage }) => percentage),
      [100, 100, 80],
    )
  })

  it('allows published projects that are not featured without Home-only content', async () => {
    const project = publishedProject()

    await project.validate()

    assert.equal(project.home.featured, false)
    assert.equal(project.homePreviewAsset, undefined)
    assert.equal(project.buildBreakdown.length, 0)
  })

  it('requires complete public content before publication', async () => {
    const project = new PortfolioProject({
      slug: 'incomplete',
      title: 'Incomplete',
      status: 'published',
    })

    await assert.rejects(project.validate(), (error) => {
      assert.equal(error.name, 'ValidationError')
      assert.ok(error.errors.scope)
      assert.ok(error.errors.position)
      assert.ok(error.errors.themeColor)
      assert.ok(error.errors['timeline.startDate'])
      assert.ok(error.errors.logoAsset)
      assert.ok(error.errors.screenshots)
      assert.ok(error.errors.publishedAt)
      return true
    })
  })

  it('requires Home-only content when a published project is featured', async () => {
    const project = publishedProject({ home: { featured: true, primary: false, order: 1 } })

    await assert.rejects(project.validate(), (error) => {
      assert.ok(error.errors.tagline)
      assert.ok(error.errors.summary)
      assert.ok(error.errors.homePreviewAsset)
      assert.ok(error.errors.buildBreakdown)
      return true
    })
  })

  it('rejects invalid project state and bounded nested values', async () => {
    const project = new PortfolioProject({
      slug: 'Invalid Slug',
      title: 'Invalid project',
      themeColor: '#FFF',
      timeline: { startDate: '2026-10-01', endDate: '2026-09-01' },
      home: { featured: false, primary: true },
      buildBreakdown: [{ label: 'Backend', percentage: 87.5 }],
      links: [{ type: 'website', label: 'Website', url: 'http://insecure.example' }],
    })

    await assert.rejects(project.validate(), (error) => {
      assert.ok(error.errors.slug)
      assert.ok(error.errors.themeColor)
      assert.ok(error.errors['timeline.endDate'])
      assert.ok(error.errors['home.primary'])
      assert.ok(error.errors['buildBreakdown.0.percentage'])
      assert.ok(error.errors['links.0.url'])
      return true
    })
  })

  it('defines deterministic public ordering and uniqueness indexes', () => {
    assert.equal(hasIndex(PortfolioProject, { slug: 1 }, { unique: true }), true)
    assert.equal(hasIndex(PortfolioProject, { status: 1, projectsPageOrder: 1, _id: 1 }), true)
    assert.equal(
      hasIndex(PortfolioProject, { status: 1, 'home.featured': 1, 'home.order': 1, _id: 1 }),
      true,
    )
    assert.equal(
      hasIndex(
        PortfolioProject,
        { 'home.primary': 1 },
        {
          unique: true,
          partialFilterExpression: { status: 'published', 'home.primary': true },
        },
      ),
      true,
    )
  })
})

describe('MediaAsset model', () => {
  it('stores provider metadata outside project documents', async () => {
    const asset = new MediaAsset({
      providerAssetId: '6f87f9462fbb4f5a9d6b892b4d0b2f31',
      secureUrl: 'https://res.cloudinary.com/example/image/upload/unicon.webp',
      format: 'webp',
      width: 800,
      height: 800,
      bytes: 120_000,
      alt: 'Unicon logo',
    })

    await asset.validate()

    assert.equal(MediaAsset.collection.collectionName, 'media_assets')
    assert.equal(asset.provider, 'cloudinary')
    assert.equal(asset.resourceType, 'image')
    assert.equal(asset.status, 'active')
  })

  it('requires integer image dimensions and byte counts', async () => {
    const asset = new MediaAsset({
      providerAssetId: 'fractional',
      secureUrl: 'https://example.com/image.webp',
      format: 'webp',
      width: 800.5,
      height: 600,
      bytes: 120_000.5,
      alt: 'Fractional metadata',
    })

    await assert.rejects(asset.validate(), (error) => {
      assert.ok(error.errors.width)
      assert.ok(error.errors.bytes)
      return true
    })
  })

  it('rejects insecure URLs and oversized image metadata', async () => {
    const asset = new MediaAsset({
      providerAssetId: 'unsafe',
      secureUrl: 'http://example.com/image.png',
      format: 'png',
      width: 800,
      height: 800,
      bytes: 11 * 1024 * 1024,
      alt: 'Unsafe image',
    })

    await assert.rejects(asset.validate(), (error) => {
      assert.ok(error.errors.secureUrl)
      assert.ok(error.errors.bytes)
      return true
    })
  })

  it('defines provider uniqueness and lifecycle indexes', () => {
    assert.equal(hasIndex(MediaAsset, { provider: 1, providerAssetId: 1 }, { unique: true }), true)
    assert.equal(hasIndex(MediaAsset, { status: 1, createdAt: 1, _id: 1 }), true)
  })
})
