import cors from 'cors'
import express from 'express'
import createError from 'http-errors'
import mongoose from 'mongoose'
import morgan from 'morgan'

import { errorHandler } from './middleware/error-handler.js'

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

  app.use((_request, _response, next) => {
    next(createError(404, 'Route not found'))
  })

  app.use(errorHandler)

  return app
}
