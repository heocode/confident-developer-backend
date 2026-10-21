import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  MAX_ANIMATION_BYTES,
  MAX_VIDEO_BYTES,
  MediaAsset,
} from '../../../src/modules/media/media-asset.js'

function hasIndex(model, fields, expectedOptions = {}) {
  return model.schema.indexes().some(([indexFields, options]) => {
    const fieldsMatch = JSON.stringify(indexFields) === JSON.stringify(fields)
    const optionsMatch = Object.entries(expectedOptions).every(
      ([key, value]) => JSON.stringify(options[key]) === JSON.stringify(value),
    )
    return fieldsMatch && optionsMatch
  })
}

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
    assert.equal(asset.kind, 'image')
    assert.equal(asset.resourceType, 'image')
    assert.equal(asset.status, 'active')
  })

  it('stores PDF documents under the stricter document constraints', async () => {
    const document = new MediaAsset({
      kind: 'document',
      providerAssetId: 'resume-document',
      secureUrl: 'https://res.cloudinary.com/example/image/upload/resume.pdf',
      format: 'pdf',
      width: 612,
      height: 792,
      bytes: 100_000,
      alt: 'Vadim Iskakov resume',
    })

    await document.validate()

    document.format = 'webp'
    await assert.rejects(document.validate(), (error) => Boolean(error.errors.format))
    document.format = 'pdf'
    document.bytes = 6 * 1024 * 1024
    await assert.rejects(document.validate(), (error) => Boolean(error.errors.bytes))
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

  it('stores constrained MP4 videos with an image preview', async () => {
    const previewId = '68e6b0000000000000000002'
    const video = new MediaAsset({
      kind: 'video',
      providerAssetId: 'service-promo-video',
      secureUrl: 'https://res.cloudinary.com/example/video/upload/promo.mp4',
      resourceType: 'video',
      format: 'mp4',
      width: 720,
      height: 1280,
      duration: 29.87,
      bytes: 1_200_000,
      previewAsset: previewId,
      alt: 'Product design promo video',
    })

    await video.validate()

    video.bytes = MAX_VIDEO_BYTES + 1
    await assert.rejects(video.validate(), (error) => Boolean(error.errors.bytes))
    video.bytes = 1_200_000
    video.previewAsset = undefined
    await assert.rejects(video.validate(), (error) => Boolean(error.errors.previewAsset))
  })

  it('stores Rive animations as raw assets with an image preview', async () => {
    const animation = new MediaAsset({
      kind: 'animation',
      providerAssetId: 'service-rive-animation',
      secureUrl: 'https://res.cloudinary.com/example/raw/upload/interaction.riv',
      resourceType: 'raw',
      format: 'riv',
      bytes: MAX_ANIMATION_BYTES,
      previewAsset: '68e6b0000000000000000002',
      alt: 'Interactive product animation',
    })

    await animation.validate()

    animation.width = 800
    await assert.rejects(animation.validate(), (error) => Boolean(error.errors.width))
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
