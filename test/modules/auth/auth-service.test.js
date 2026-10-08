import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ADMIN_SESSION_TTL_MS } from '../../../src/modules/auth/admin-session-cookie.js'
import { createAuthService, hashSessionToken } from '../../../src/modules/auth/auth-service.js'

const PASSWORD_HASH = '$2b$12$MHjYVN0mS2LOjgZ3wPqlFubMRt02.vmeEE/uIEoteh2uOPyQNwsLq'

function query(value) {
  const result = Promise.resolve(value)

  return {
    select() {
      return result
    },
    then(resolve, reject) {
      return result.then(resolve, reject)
    },
  }
}

function createModelAdapters() {
  const admin = {
    _id: 'admin-id',
    id: 'admin-id',
    displayName: 'Vadim',
    email: 'owner@example.com',
    passwordHash: PASSWORD_HASH,
    isActive: true,
    lastLoginAt: undefined,
    async save() {},
  }
  const sessions = []

  const adminUserModel = {
    findOne(filter) {
      if (filter.email !== undefined) {
        return query(filter.email === admin.email ? admin : null)
      }

      const matches = filter._id === admin._id && (!filter.isActive || admin.isActive)
      return query(matches ? admin : null)
    },
  }

  const adminSessionModel = {
    async create(data) {
      const session = { _id: `session-${sessions.length + 1}`, ...data }
      sessions.push(session)
      return session
    },
    async deleteMany(filter) {
      for (let index = sessions.length - 1; index >= 0; index -= 1) {
        if (sessions[index].admin === filter.admin) sessions.splice(index, 1)
      }
    },
    findOne(filter) {
      const session = sessions.find(
        (candidate) =>
          candidate.tokenHash === filter.tokenHash && candidate.expiresAt.getTime() > filter.expiresAt.$gt.getTime(),
      )
      return query(session ?? null)
    },
    async deleteOne(filter) {
      const index = sessions.findIndex(
        (session) => session._id === filter._id || session.tokenHash === filter.tokenHash,
      )
      if (index >= 0) sessions.splice(index, 1)
    },
  }

  return { admin, sessions, adminUserModel, adminSessionModel }
}

describe('admin authentication service', () => {
  it('stores only a token hash, expires sessions, and rotates the active session', async () => {
    const adapters = createModelAdapters()
    const issuedAt = new Date('2026-10-07T12:00:00.000Z')
    const tokens = ['first-opaque-token', 'second-opaque-token']
    const authService = createAuthService({
      adminUserModel: adapters.adminUserModel,
      adminSessionModel: adapters.adminSessionModel,
      now: () => issuedAt,
      createToken: () => tokens.shift(),
    })

    const firstLogin = await authService.login({
      email: adapters.admin.email,
      password: 'not-a-real-admin-password',
    })

    assert.equal(firstLogin.token, 'first-opaque-token')
    assert.equal(adapters.sessions.length, 1)
    assert.equal(adapters.sessions[0].tokenHash, hashSessionToken('first-opaque-token'))
    assert.notEqual(adapters.sessions[0].tokenHash, 'first-opaque-token')
    assert.equal(adapters.sessions[0].expiresAt.getTime(), issuedAt.getTime() + ADMIN_SESSION_TTL_MS)
    assert.equal(adapters.admin.lastLoginAt, issuedAt)

    const secondLogin = await authService.login({
      email: adapters.admin.email,
      password: 'not-a-real-admin-password',
    })

    assert.equal(secondLogin.token, 'second-opaque-token')
    assert.equal(adapters.sessions.length, 1)
    assert.equal(adapters.sessions[0].tokenHash, hashSessionToken('second-opaque-token'))
    assert.equal(await authService.getAdminForToken(secondLogin.token), adapters.admin)
  })

  it('uses one generic response for missing, invalid, and inactive administrators', async () => {
    const adapters = createModelAdapters()
    const authService = createAuthService({
      adminUserModel: adapters.adminUserModel,
      adminSessionModel: adapters.adminSessionModel,
    })

    await assert.rejects(
      authService.login({ email: 'missing@example.com', password: 'wrong' }),
      (error) => error.status === 401 && error.message === 'Invalid email or password',
    )
    await assert.rejects(
      authService.login({ email: adapters.admin.email, password: 'wrong' }),
      (error) => error.status === 401 && error.message === 'Invalid email or password',
    )

    adapters.admin.isActive = false
    await assert.rejects(
      authService.login({ email: adapters.admin.email, password: 'not-a-real-admin-password' }),
      (error) => error.status === 401 && error.message === 'Invalid email or password',
    )
  })

  it('rejects missing and expired sessions and revokes a session on logout', async () => {
    const adapters = createModelAdapters()
    let currentTime = new Date('2026-10-07T12:00:00.000Z')
    const authService = createAuthService({
      adminUserModel: adapters.adminUserModel,
      adminSessionModel: adapters.adminSessionModel,
      now: () => currentTime,
      createToken: () => 'opaque-token',
    })

    await assert.rejects(authService.getAdminForToken(), /Authentication required/)
    await authService.login({ email: adapters.admin.email, password: 'not-a-real-admin-password' })

    currentTime = new Date(currentTime.getTime() + ADMIN_SESSION_TTL_MS + 1)
    await assert.rejects(authService.getAdminForToken('opaque-token'), /Authentication required/)

    currentTime = new Date('2026-10-07T12:00:00.000Z')
    await authService.logout('opaque-token')
    assert.equal(adapters.sessions.length, 0)
  })
})
