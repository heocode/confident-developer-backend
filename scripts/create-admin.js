import 'dotenv/config'

import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'

import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'

import { connectToDatabase } from '../src/config/database.js'
import { AdminUser } from '../src/models/admin-user.js'

function promptHidden(question) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('Admin creation requires an interactive terminal')
  }

  return new Promise((resolve, reject) => {
    let value = ''
    let settled = false
    const previousRawMode = input.isRaw

    const cleanup = () => {
      input.removeListener('data', onData)
      input.setRawMode(previousRawMode)
      input.pause()
      output.write('\n')
    }

    const finish = (callback) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }

    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          finish(() => reject(new Error('Admin creation cancelled')))
          return
        }

        if (character === '\r' || character === '\n') {
          finish(() => resolve(value))
          return
        }

        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1)
        } else if (character >= ' ') {
          value += character
        }
      }
    }

    output.write(question)
    input.setEncoding('utf8')
    input.setRawMode(true)
    input.resume()
    input.on('data', onData)
  })
}

function validatePassword(password) {
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Password must contain at least 12 characters and at most 72 UTF-8 bytes')
  }
}

async function readAdminInput() {
  const prompts = createInterface({ input, output })
  const displayName = (await prompts.question('Display name: ')).trim()
  const email = (await prompts.question('Email: ')).trim().toLowerCase()
  prompts.close()

  if (!displayName) throw new Error('Display name is required')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('A valid email is required')
  }

  const password = await promptHidden('Password: ')
  validatePassword(password)
  const confirmation = await promptHidden('Confirm password: ')

  if (password !== confirmation) throw new Error('Passwords do not match')

  return { displayName, email, password }
}

async function createAdmin() {
  const inputData = await readAdminInput()

  await connectToDatabase(process.env.MONGODB_URI)

  try {
    if (await AdminUser.exists({})) {
      throw new Error('An administrator already exists')
    }

    await AdminUser.create({
      displayName: inputData.displayName,
      email: inputData.email,
      passwordHash: await bcrypt.hash(inputData.password, 12),
    })

    console.log('Administrator created successfully.')
  } finally {
    await mongoose.disconnect()
  }
}

createAdmin().catch((error) => {
  console.error(`Unable to create administrator: ${error.message}`)
  process.exitCode = 1
})
