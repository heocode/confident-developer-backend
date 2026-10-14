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

  return {
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
