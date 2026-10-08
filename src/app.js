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
import { createAuthService } from './modules/auth/auth-service.js'
import { createMediaService } from './modules/media/media-service.js'
import { createCloudinaryMediaProvider } from './modules/media/providers/cloudinary-media-provider.js'
import { createAdminProjectService } from './modules/projects/admin/admin-project-service.js'
import { createPublicProjectService } from './modules/projects/public/public-project-service.js'

export function createApp({
  environment = loadEnvironment(),
  enableCourseworkApi = environment.enableCourseworkApi,
  apiRateLimitOptions,
  loginRateLimitOptions,
  authService = createAuthService(),
  mediaProvider = createCloudinaryMediaProvider(environment.cloudinary),
  mediaService = createMediaService({ mediaProvider }),
  projectService = createAdminProjectService(),
  publicProjectService = createPublicProjectService(),
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
      mediaService,
      projectService,
      publicProjectService,
      environment,
      loginRateLimitOptions,
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
