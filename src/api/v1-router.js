import { Router } from 'express'
import { z } from 'zod'

import { noStore } from '../middleware/no-store.js'
import { requireTrustedOrigin } from '../middleware/require-trusted-origin.js'
import { validateRequest } from '../middleware/validate-request.js'
import { serializeAdmin } from '../modules/auth/admin-serializer.js'
import { createAuthRouter } from '../modules/auth/auth-routes.js'
import { requireAdminSession } from '../modules/auth/require-admin-session.js'
import { createAdminContactRouter } from '../modules/contact/admin/admin-contact-routes.js'
import { createPublicContactRouter } from '../modules/contact/public/public-contact-routes.js'
import { createAdminGitHubRouter } from '../modules/github/admin/admin-github-routes.js'
import { createPublicGitHubRouter } from '../modules/github/public/public-github-routes.js'
import { createAdminMediaRouter } from '../modules/media/admin/admin-media-routes.js'
import { createAdminProfileRouter } from '../modules/profile/admin/admin-profile-routes.js'
import { createPublicProfileRouter } from '../modules/profile/public/public-profile-routes.js'
import { createAdminProfilePostRouter } from '../modules/profile-post/admin/admin-profile-post-routes.js'
import { createPublicProfilePostRouter } from '../modules/profile-post/public/public-profile-post-routes.js'
import { createAdminReferenceRouter } from '../modules/references/admin/admin-reference-routes.js'
import { createPublicReferenceRouter } from '../modules/references/public/public-reference-routes.js'
import { createAdminProjectRouter } from '../modules/projects/admin/admin-project-routes.js'
import { createPublicProjectRouter } from '../modules/projects/public/public-project-routes.js'
import { createAdminServiceRouter } from '../modules/services/admin/admin-service-routes.js'
import { createPublicServiceRouter } from '../modules/services/public/public-service-routes.js'

export function createV1Router({
  authService,
  githubService,
  mediaService,
  profileService,
  profilePostService,
  referenceService,
  contactService,
  projectService,
  publicProjectService,
  serviceService,
  publicServiceService,
  environment,
  loginRateLimitOptions,
  profileLikeRateLimitOptions,
  profileViewRateLimitOptions,
  referenceSubmissionRateLimitOptions,
  contactSubmissionRateLimitOptions,
}) {
  const router = Router()

  router.get('/', validateRequest({ query: z.strictObject({}) }), (_request, response) => {
    response.json({
      success: true,
      message: 'Production API v1 is available.',
      data: {
        version: 'v1',
      },
    })
  })

  router.use('/auth', createAuthRouter({ authService, environment, loginRateLimitOptions }))
  router.use(
    '/contact',
    createPublicContactRouter({
      contactService,
      environment,
      submissionRateLimitOptions: contactSubmissionRateLimitOptions,
    }),
  )
  router.use('/github-summary', createPublicGitHubRouter({ githubService }))
  router.use('/profile', createPublicProfileRouter({ profileService }))
  router.use(
    '/profile-post',
    createPublicProfilePostRouter({
      profilePostService,
      environment,
      likeRateLimitOptions: profileLikeRateLimitOptions,
      viewRateLimitOptions: profileViewRateLimitOptions,
    }),
  )
  router.use(
    '/projects',
    createPublicProjectRouter({ projectService: publicProjectService, mediaService }),
  )
  router.use(
    '/references',
    createPublicReferenceRouter({
      referenceService,
      environment,
      submissionRateLimitOptions: referenceSubmissionRateLimitOptions,
    }),
  )
  router.use('/services', createPublicServiceRouter({ serviceService: publicServiceService }))
  router.use(
    '/admin',
    noStore,
    requireTrustedOrigin(environment.clientOrigins),
    requireAdminSession({ authService, environment }),
  )
  router.get('/admin', (request, response) => {
    response.json({
      success: true,
      message: 'Admin API is available.',
      data: serializeAdmin(request.admin),
    })
  })
  router.use('/admin/media', createAdminMediaRouter({ mediaService }))
  router.use('/admin/profile', createAdminProfileRouter({ profileService }))
  router.use('/admin/github', createAdminGitHubRouter({ githubService }))
  router.use('/admin/profile-post', createAdminProfilePostRouter({ profilePostService }))
  router.use('/admin/inquiries', createAdminContactRouter({ contactService }))
  router.use('/admin/references', createAdminReferenceRouter({ referenceService }))
  router.use('/admin/projects', createAdminProjectRouter({ projectService }))
  router.use('/admin/services', createAdminServiceRouter({ serviceService }))

  return router
}
