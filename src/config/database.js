import mongoose from 'mongoose'

const REQUIRED_DATABASE_NAME = 'portfolio'

function hasRequiredDatabaseName(connectionString) {
  return new RegExp(`/${REQUIRED_DATABASE_NAME}(?:\\?|$)`).test(connectionString)
}

export async function connectToDatabase(connectionString) {
  if (!connectionString) {
    throw new Error('MONGODB_URI is required')
  }

  if (!hasRequiredDatabaseName(connectionString)) {
    throw new Error(`MONGODB_URI must use the ${REQUIRED_DATABASE_NAME} database`)
  }

  await mongoose.connect(connectionString, {
    serverSelectionTimeoutMS: 10_000,
  })

  console.log(`Connected to MongoDB database: ${mongoose.connection.name}`)
}
