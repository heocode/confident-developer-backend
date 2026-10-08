import bcrypt from 'bcryptjs'

import { User } from '../models/user.js'
import { createCrudController } from '../utils/crud-controller.js'
import { normalizeUserInput } from '../utils/input-normalizers.js'

async function hashPassword(input) {
  if (input.password === undefined) return input

  return {
    ...input,
    password: await bcrypt.hash(input.password, 12),
  }
}

export const userController = createCrudController({
  model: User,
  singularName: 'User',
  pluralName: 'Users',
  normalizeInput: normalizeUserInput,
  prepareInput: hashPassword,
})
