import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import mongoose from 'mongoose'

import { createProfileService } from '../../../src/modules/profile/profile-service.js'
import { SiteProfile } from '../../../src/modules/profile/site-profile.js'

const firstAssetId = new mongoose.Types.ObjectId('68f100000000000000000001')
const secondAssetId = new mongoose.Types.ObjectId('68f100000000000000000002')

function hasIndex(model, fields, expectedOptions = {}) {
  return model.schema.indexes().some(([indexFields, options]) => {
    const fieldsMatch = JSON.stringify(indexFields) === JSON.stringify(fields)
    const optionsMatch = Object.entries(expectedOptions).every(([key, value]) => options[key] === value)
    return fieldsMatch && optionsMatch
  })
}

function resumeAsset(id = firstAssetId, overrides = {}) {
  return {
    _id: id,
    kind: 'document',
    provider: 'cloudinary',
    providerAssetId: `provider-${id}`,
    secureUrl: 'https://res.cloudinary.com/example/image/upload/resume.pdf',
    resourceType: 'image',
    format: 'pdf',
    width: 612,
    height: 792,
    bytes: 101_000,
    alt: 'Vadim Iskakov resume',
    status: 'active',
    ...overrides,
  }
}

function createHarness({ existingProfile = null, asset = resumeAsset() } = {}) {
  const state = {
    profile: existingProfile,
    asset,
    registrations: [],
    saves: 0,
  }

  function attachSave(profile) {
    profile.save = async () => {
      state.saves += 1
      profile.updatedAt = new Date('2026-10-14T12:00:00.000Z')
      state.profile = profile
      return profile
    }
    return profile
  }

  function ProfileModel(values) {
    return attachSave({
      _id: new mongoose.Types.ObjectId('68f100000000000000000010'),
      createdAt: new Date('2026-10-14T12:00:00.000Z'),
      updatedAt: new Date('2026-10-14T12:00:00.000Z'),
      ...values,
    })
  }
  ProfileModel.findOne = async () => state.profile

  if (state.profile) attachSave(state.profile)

  const mediaModel = {
    async findById(id) {
      return state.asset?._id.toString() === id.toString() ? state.asset : null
    },
  }
  const mediaService = {
    createDocumentUploadDescriptor() {
      return { provider: 'cloudinary', constraints: { formats: ['pdf'] } }
    },
    async registerDocumentAsset(input) {
      state.registrations.push(input)
      return { asset: state.asset, created: true }
    },
    createDeliveryUrl(media, preset) {
      return `${media.secureUrl}?preset=${preset}`
    },
  }

  return {
    service: createProfileService({ profileModel: ProfileModel, mediaModel, mediaService }),
    state,
  }
}

describe('SiteProfile model', () => {
  it('stores one required resume reference under a singleton key', async () => {
    const profile = new SiteProfile({ key: 'portfolio', resumeAsset: firstAssetId })

    await profile.validate()

    assert.equal(SiteProfile.collection.collectionName, 'site_profiles')
    assert.equal(profile.resumeAsset.toString(), firstAssetId.toString())
    assert.equal(hasIndex(SiteProfile, { key: 1 }, { unique: true }), true)
  })
})

describe('profile resume service', () => {
  it('registers and assigns the first managed PDF', async () => {
    const { service, state } = createHarness()

    const result = await service.replaceResume({
      provider: 'cloudinary',
      providerAssetId: 'provider-resume',
    })

    assert.equal(result.created, true)
    assert.equal(result.changed, true)
    assert.equal(state.profile.key, 'portfolio')
    assert.equal(state.profile.resumeAsset.toString(), firstAssetId.toString())
    assert.deepEqual(state.registrations[0], {
      provider: 'cloudinary',
      providerAssetId: 'provider-resume',
      alt: 'Vadim Iskakov resume',
    })
  })

  it('treats the current asset as a no-op and replaces it without deleting the previous file', async () => {
    const existingProfile = {
      _id: new mongoose.Types.ObjectId(),
      key: 'portfolio',
      resumeAsset: firstAssetId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const harness = createHarness({ existingProfile })

    const unchanged = await harness.service.replaceResume({
      provider: 'cloudinary',
      providerAssetId: 'provider-first',
    })
    harness.state.asset = resumeAsset(secondAssetId)
    const replaced = await harness.service.replaceResume({
      provider: 'cloudinary',
      providerAssetId: 'provider-second',
    })

    assert.equal(unchanged.changed, false)
    assert.equal(replaced.changed, true)
    assert.equal(harness.state.profile.resumeAsset.toString(), secondAssetId.toString())
    assert.equal(harness.state.saves, 1)
  })

  it('rejects inactive or non-document registrations', async () => {
    const { service } = createHarness({ asset: resumeAsset(firstAssetId, { kind: 'image' }) })

    await assert.rejects(
      service.replaceResume({ provider: 'cloudinary', providerAssetId: 'wrong-kind' }),
      (error) => error.status === 409,
    )
  })

  it('returns a provider-owned attachment URL and hides missing records behind 404', async () => {
    const profile = {
      _id: new mongoose.Types.ObjectId(),
      key: 'portfolio',
      resumeAsset: firstAssetId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const available = createHarness({ existingProfile: profile })
    const result = await available.service.getResumeDownloadUrl()

    assert.equal(result.downloadUrl.endsWith('?preset=resumeDownload'), true)

    const missing = createHarness()
    await assert.rejects(missing.service.getResume(), (error) => error.status === 404)
  })
})
