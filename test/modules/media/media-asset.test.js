import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MediaAsset } from '../../../src/modules/media/media-asset.js'

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
