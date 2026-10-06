import cors from 'cors'
import express from 'express'
import createError from 'http-errors'
import mongoose from 'mongoose'
import morgan from 'morgan'

import { errorHandler } from './middleware/error-handler.js'
import { projectRouter } from './routes/project-routes.js'
import { referenceRouter } from './routes/reference-routes.js'
import { serviceRouter } from './routes/service-routes.js'
import { userRouter } from './routes/user-routes.js'

function getAllowedOrigins() {
  return (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

export function createApp() {
  const app = express()
  const allowedOrigins = getAllowedOrigins()

  app.disable('x-powered-by')
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true)
          return
        }

        callback(createError(403, 'Origin is not allowed by CORS'))
      },
    }),
  )
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
  app.use(express.json({ limit: '100kb' }))
  app.use(express.urlencoded({ extended: false }))

  app.get('/api/health', (_request, response) => {
    response.json({
      success: true,
      message: 'API is healthy.',
      data: {
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      },
    })
  })

  app.use('/api/references', referenceRouter)
  app.use('/api/projects', projectRouter)
  app.use('/api/services', serviceRouter)
  app.use('/api/users', userRouter)

  app.use((_request, _response, next) => {
    next(createError(404, 'Route not found'))
  })

  app.use(errorHandler)

  return app
}
