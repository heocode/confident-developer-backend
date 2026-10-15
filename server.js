import 'dotenv/config'

import { createServer } from 'node:http'

import mongoose from 'mongoose'

import { createApp } from './src/app.js'
import { connectToDatabase } from './src/config/database.js'
import { loadEnvironment } from './src/config/environment.js'
import { createContactOwnerNotificationHandler } from './src/modules/contact/contact-owner-notification-handler.js'
import { createEmailDeliveryService } from './src/modules/email/email-delivery-service.js'
import { createEmailDeliveryWorker } from './src/modules/email/email-delivery-worker.js'
import { contactOwnerNotificationKind } from './src/modules/email/email-delivery-values.js'
import { createResendEmailProvider } from './src/modules/email/providers/resend-email-provider.js'

const environment = loadEnvironment()

async function startServer() {
  await connectToDatabase(environment.mongodbUri)

  const emailDeliveryService = createEmailDeliveryService()
  let emailDeliveryWorker

  if (environment.email) {
    const emailProvider = createResendEmailProvider({ apiKey: environment.email.apiKey })
    const contactNotificationHandler = createContactOwnerNotificationHandler({
      emailProvider,
      fromEmail: environment.email.fromEmail,
      notificationToEmail: environment.email.notificationToEmail,
    })
    emailDeliveryWorker = createEmailDeliveryWorker({
      deliveryService: emailDeliveryService,
      handlers: new Map([[contactOwnerNotificationKind, contactNotificationHandler]]),
    })
  } else {
    console.warn('Email delivery worker is disabled because email configuration is not set')
  }

  const server = createServer(createApp({ environment, emailDeliveryService }))

  server.listen(environment.port, () => {
    console.log(`Server listening on port ${environment.port}`)
    emailDeliveryWorker?.start()
  })

  let shuttingDown = false
  const shutdown = async (signal) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`${signal} received. Shutting down gracefully.`)

    const serverClosed = new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })

    try {
      await emailDeliveryWorker?.stop()
      await serverClosed
      await mongoose.disconnect()
      process.exit(0)
    } catch (error) {
      console.error('Graceful shutdown failed:', error)
      process.exit(1)
    }
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

startServer().catch((error) => {
  console.error('Unable to start server:', error)
  process.exit(1)
})
