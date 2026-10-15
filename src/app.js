import cors from 'cors'
import cookieParser from 'cookie-parser'
import express from 'express'
import helmet from 'helmet'
import createError from 'http-errors'
import mongoose from 'mongoose'
import morgan from 'morgan'

import { createV1Router } from './api/v1-router.js'
import { loadEnvironment } from './config/environment.js'
import { projectRouter } from './coursework/routes/project-routes.js'
import { referenceRouter } from './coursework/routes/reference-routes.js'
import { serviceRouter } from './coursework/routes/service-routes.js'
import { userRouter } from './coursework/routes/user-routes.js'
import { createApiRateLimiter } from './middleware/api-rate-limiter.js'
import { errorHandler } from './middleware/error-handler.js'
import { createAntiSpamService } from './modules/anti-spam/anti-spam-service.js'
import { createCloudflareTurnstileProvider } from './modules/anti-spam/providers/cloudflare-turnstile-provider.js'
import { createAuthService } from './modules/auth/auth-service.js'
import { createContactService } from './modules/contact/contact-service.js'
import { createEmailDeliveryService } from './modules/email/email-delivery-service.js'
import { createGitHubService } from './modules/github/github-service.js'
import { createGitHubRestProvider } from './modules/github/providers/github-rest-provider.js'
import { createMediaService } from './modules/media/media-service.js'
import { createCloudinaryMediaProvider } from './modules/media/providers/cloudinary-media-provider.js'
import { createProfileService } from './modules/profile/profile-service.js'
import { createProfilePostService } from './modules/profile-post/profile-post-service.js'
import { createReferenceService } from './modules/references/reference-service.js'
import { createAdminProjectService } from './modules/projects/admin/admin-project-service.js'
import { createPublicProjectService } from './modules/projects/public/public-project-service.js'
import { createAdminServiceService } from './modules/services/admin/admin-service-service.js'
import { createPublicServiceService } from './modules/services/public/public-service-service.js'

export function createApp({
  environment = loadEnvironment(),
  enableCourseworkApi = environment.enableCourseworkApi,
  apiRateLimitOptions,
  loginRateLimitOptions,
  profileLikeRateLimitOptions,
  profileViewRateLimitOptions,
  referenceSubmissionRateLimitOptions,
  contactSubmissionRateLimitOptions,
  authService = createAuthService(),
  githubProvider = createGitHubRestProvider(environment.github),
  githubService = createGitHubService({ githubProvider }),
  mediaProvider = createCloudinaryMediaProvider(environment.cloudinary),
  mediaService = createMediaService({ mediaProvider }),
  profileService = createProfileService({ mediaService }),
  profilePostService = createProfilePostService(),
  turnstileProvider = createCloudflareTurnstileProvider(environment.turnstile),
  antiSpamService = createAntiSpamService({ turnstileProvider }),
  emailDeliveryService = createEmailDeliveryService(),
  contactService = createContactService({ antiSpamService, emailDeliveryService }),
  referenceService = createReferenceService({ antiSpamService, profileService }),
  projectService = createAdminProjectService(),
  publicProjectService = createPublicProjectService(),
  serviceService = createAdminServiceService(),
  publicServiceService = createPublicServiceService(),
} = {}) {
  const app = express()
  const allowedOrigins = environment.clientOrigins

  app.disable('x-powered-by')
  app.set('env', environment.nodeEnv)
  app.set('trust proxy', environment.trustProxy)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          upgradeInsecureRequests: environment.nodeEnv === 'development' ? null : [],
        },
      },
    }),
  )
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true)
          return
        }

        callback(createError(403, 'Origin is not allowed by CORS'))
      },
    }),
  )
  app.use(morgan(environment.nodeEnv === 'production' ? 'combined' : 'dev'))
  app.use(express.json({ limit: '100kb' }))
  app.use(express.urlencoded({ extended: false, limit: '100kb' }))
  app.use(cookieParser())

  app.get('/api/health', (_request, response) => {
    response.json({
      success: true,
      message: 'API is healthy.',
      data: {
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      },
    })
  })

  app.use(
    '/api/v1',
    createApiRateLimiter(apiRateLimitOptions),
    createV1Router({
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
    }),
  )

  if (enableCourseworkApi) {
    app.use('/api/references', referenceRouter)
    app.use('/api/projects', projectRouter)
    app.use('/api/services', serviceRouter)
    app.use('/api/users', userRouter)
  }

  app.use((_request, _response, next) => {
    next(createError(404, 'Route not found'))
  })

  app.use(errorHandler)

  return app
}
