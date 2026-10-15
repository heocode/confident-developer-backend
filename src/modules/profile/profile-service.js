import createError from 'http-errors'

import { MediaAsset } from '../media/media-asset.js'
import { SITE_PROFILE_KEY, SiteProfile } from './site-profile.js'

export const RESUME_ACCESSIBLE_LABEL = 'Vadim Iskakov resume'
export const RESUME_FILE_NAME = 'Vadim-Iskakov-Resume.pdf'

function assertResumeAsset(asset) {
  if (!asset || asset.status !== 'active' || asset.kind !== 'document' || asset.format !== 'pdf') {
    throw createError(409, 'Registered asset is not an active PDF document')
  }
}

function assertAvatarAsset(asset) {
  if (!asset || asset.status !== 'active' || (asset.kind ?? 'image') !== 'image') {
    throw createError(409, 'Registered asset is not an active image')
  }
}

function sameId(left, right) {
  return left?.toString() === right?.toString()
}

export function createProfileService({
  profileModel = SiteProfile,
  mediaModel = MediaAsset,
  mediaService,
} = {}) {
  async function getResumeRecord() {
    const profile = await profileModel.findOne({ key: SITE_PROFILE_KEY })
    if (!profile) throw createError(404, 'Resume not found')

    const asset = await mediaModel.findById(profile.resumeAsset)
    if (!asset || asset.status !== 'active' || asset.kind !== 'document' || asset.format !== 'pdf') {
      throw createError(404, 'Resume not found')
    }

    return { profile, asset }
  }

  async function findPublicIdentity() {
    const profile = await profileModel.findOne({ key: SITE_PROFILE_KEY })
    if (!profile?.publicIdentity) return null

    const asset = await mediaModel.findById(profile.publicIdentity.avatarAsset)
    if (!asset || asset.status !== 'active' || (asset.kind ?? 'image') !== 'image') return null

    return {
      profile,
      asset,
      avatarUrl: mediaService.createDeliveryUrl(asset, 'avatar'),
    }
  }

  return {
    findPublicIdentity,

    async getPublicIdentity() {
      const identity = await findPublicIdentity()
      if (!identity) throw createError(404, 'Public profile not found')
      return identity
    },

    async updatePublicIdentity({ displayName, handle, avatarAssetId }) {
      const profile = await profileModel.findOne({ key: SITE_PROFILE_KEY })
      if (!profile) throw createError(409, 'Site profile must be initialized with a resume first')

      const asset = await mediaModel.findById(avatarAssetId)
      assertAvatarAsset(asset)

      const current = profile.publicIdentity
      const changed =
        !current ||
        current.displayName !== displayName ||
        current.handle !== handle ||
        !sameId(current.avatarAsset, asset._id)

      if (changed) {
        profile.publicIdentity = { displayName, handle, avatarAsset: asset._id }
        await profile.save()
      }

      return {
        profile,
        asset,
        avatarUrl: mediaService.createDeliveryUrl(asset, 'avatar'),
        changed,
      }
    },

    createResumeUploadDescriptor() {
      return mediaService.createDocumentUploadDescriptor()
    },

    async replaceResume({ provider, providerAssetId }) {
      const { asset, created: assetCreated } = await mediaService.registerDocumentAsset({
        provider,
        providerAssetId,
        alt: RESUME_ACCESSIBLE_LABEL,
      })
      assertResumeAsset(asset)

      let profile = await profileModel.findOne({ key: SITE_PROFILE_KEY })
      if (!profile) {
        profile = new profileModel({ key: SITE_PROFILE_KEY, resumeAsset: asset._id })
        await profile.save()
        return { profile, asset, created: true, changed: true, assetCreated }
      }

      if (profile.resumeAsset.toString() === asset._id.toString()) {
        return { profile, asset, created: false, changed: false, assetCreated }
      }

      profile.resumeAsset = asset._id
      await profile.save()
      return { profile, asset, created: false, changed: true, assetCreated }
    },

    getResume: getResumeRecord,

    async getResumeDownloadUrl() {
      const result = await getResumeRecord()
      return {
        ...result,
        downloadUrl: mediaService.createDeliveryUrl(result.asset, 'resumeDownload'),
      }
    },
  }
}
