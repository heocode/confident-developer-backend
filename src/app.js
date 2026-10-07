import cors from 'cors'
import cookieParser from 'cookie-parser'
import express from 'express'
import helmet from 'helmet'
import createError from 'http-errors'
import mongoose from 'mongoose'
import morgan from 'morgan'

import { loadEnvironment } from './config/environment.js'
import { createApiRateLimiter } from './middleware/api-rate-limiter.js'
import { errorHandler } from './middleware/error-handler.js'
import { createAuthService } from './services/auth-service.js'
import { createCloudinaryMediaProvider } from './services/cloudinary-media-provider.js'
import { createMediaService } from './services/media-service.js'
import { createPortfolioProjectService } from './services/portfolio-project-service.js'
import { projectRouter } from './routes/project-routes.js'
import { referenceRouter } from './routes/reference-routes.js'
import { serviceRouter } from './routes/service-routes.js'
import { userRouter } from './routes/user-routes.js'
import { createV1Router } from './routes/v1-routes.js'

export function createApp({
  environment = loadEnvironment(),
  enableCourseworkApi = environment.enableCourseworkApi,
  apiRateLimitOptions,
  loginRateLimitOptions,
  authService = createAuthService(),
  mediaProvider = createCloudinaryMediaProvider(environment.cloudinary),
  mediaService = createMediaService({ mediaProvider }),
  projectService = createPortfolioProjectService(),
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
    createV1Router({ authService, mediaService, projectService, environment, loginRateLimitOptions }),
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
