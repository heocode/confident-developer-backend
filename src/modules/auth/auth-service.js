import { createHash, randomBytes } from 'node:crypto'

import bcrypt from 'bcryptjs'
import createError from 'http-errors'

import { AdminSession } from './admin-session.js'
import { ADMIN_SESSION_TTL_MS } from './admin-session-cookie.js'
import { AdminUser } from './admin-user.js'

const DUMMY_PASSWORD_HASH = '$2b$12$MHjYVN0mS2LOjgZ3wPqlFubMRt02.vmeEE/uIEoteh2uOPyQNwsLq'
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password'

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function createAuthService({
  adminUserModel = AdminUser,
  adminSessionModel = AdminSession,
  now = () => new Date(),
  createToken = () => randomBytes(32).toString('base64url'),
} = {}) {
  return {
    async login({ email, password }) {
      const admin = await adminUserModel.findOne({ email }).select('+passwordHash')
      const passwordMatches = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_PASSWORD_HASH)

      if (!admin || !admin.isActive || !passwordMatches) {
        throw createError(401, INVALID_CREDENTIALS_MESSAGE)
      }

      const token = createToken()
      const issuedAt = now()
      const expiresAt = new Date(issuedAt.getTime() + ADMIN_SESSION_TTL_MS)

      await adminSessionModel.deleteMany({ admin: admin._id })
      await adminSessionModel.create({
        admin: admin._id,
        tokenHash: hashSessionToken(token),
        expiresAt,
      })

      admin.lastLoginAt = issuedAt
      await admin.save()

      return { admin, token, expiresAt }
    },

    async getAdminForToken(token) {
      if (!token) throw createError(401, 'Authentication required')

      const session = await adminSessionModel.findOne({
        tokenHash: hashSessionToken(token),
        expiresAt: { $gt: now() },
      })

      if (!session) throw createError(401, 'Authentication required')

      const admin = await adminUserModel.findOne({ _id: session.admin, isActive: true })

      if (!admin) {
        await adminSessionModel.deleteOne({ _id: session._id })
        throw createError(401, 'Authentication required')
      }

      return admin
    },

    async logout(token) {
      if (!token) return

      await adminSessionModel.deleteOne({ tokenHash: hashSessionToken(token) })
    },
  }
}
