import 'dotenv/config'

import { createServer } from 'node:http'

import mongoose from 'mongoose'

import { createApp } from './src/app.js'
import { connectToDatabase } from './src/config/database.js'
import { loadEnvironment } from './src/config/environment.js'

const environment = loadEnvironment()

async function startServer() {
  await connectToDatabase(environment.mongodbUri)

  const server = createServer(createApp({ environment }))

  server.listen(environment.port, () => {
    console.log(`Server listening on port ${environment.port}`)
  })

  const shutdown = async (signal) => {
    console.log(`${signal} received. Shutting down gracefully.`)

    server.close(async () => {
      await mongoose.disconnect()
      process.exit(0)
    })
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

startServer().catch((error) => {
  console.error('Unable to start server:', error)
  process.exit(1)
})
