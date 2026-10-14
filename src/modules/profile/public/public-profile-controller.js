const RESUME_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'
const RESUME_CDN_CACHE_CONTROL = 'max-age=60, stale-while-revalidate=300'

export function createPublicProfileController({ profileService }) {
  return {
    downloadResume: async (_request, response) => {
      const { downloadUrl } = await profileService.getResumeDownloadUrl()

      response
        .set('Cache-Control', RESUME_CACHE_CONTROL)
        .set('CDN-Cache-Control', RESUME_CDN_CACHE_CONTROL)
        .redirect(302, downloadUrl)
    },
  }
}
