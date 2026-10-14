import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'

import createError from 'http-errors'
import mongoose from 'mongoose'

import { createApp } from '../../../src/app.js'
import { loadEnvironment } from '../../../src/config/environment.js'

const frontendOrigin = 'http://localhost:5173'
const sessionCookie = 'cd_admin_session=profile-resume-session'
const assetId = new mongoose.Types.ObjectId('68f100000000000000000001')

function resumeRecord() {
  return {
    profile: {
      _id: new mongoose.Types.ObjectId('68f100000000000000000010'),
      key: 'portfolio',
      resumeAsset: assetId,
      createdAt: new Date('2026-10-14T12:00:00.000Z'),
      updatedAt: new Date('2026-10-14T13:00:00.000Z'),
    },
    asset: {
      _id: assetId,
      kind: 'document',
      provider: 'cloudinary',
      secureUrl: 'https://res.cloudinary.com/example/image/upload/resume.pdf',
      format: 'pdf',
      bytes: 101_000,
      status: 'active',
    },
  }
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const body = await response.json()
  return { response, body }
}

describe('profile resume HTTP contract', () => {
  let baseUrl
  let server
  let calls

  const authService = {
    async getAdminForToken(token) {
      if (token !== 'profile-resume-session') throw createError(401, 'Authentication required')
      return { id: 'admin-id', displayName: 'Owner', email: 'owner@example.com' }
    },
  }

  const profileService = {
    createResumeUploadDescriptor() {
      calls.signatures += 1
      return {
        provider: 'cloudinary',
        upload: {
          method: 'POST',
          url: 'https://api.cloudinary.com/v1_1/example/image/upload',
          fields: { api_key: 'public-key', signature: 'signed-value', timestamp: 1_791_379_200 },
        },
        constraints: { formats: ['pdf'], maxBytes: 5 * 1024 * 1024 },
        expiresAt: new Date('2026-10-14T13:00:00.000Z'),
      }
    },
    async getResume() {
      calls.get += 1
      if (calls.missing) throw createError(404, 'Resume not found')
      return resumeRecord()
    },
    async replaceResume(input) {
      calls.replace.push(input)
      return { ...resumeRecord(), created: true, changed: true }
    },
    async getResumeDownloadUrl() {
      calls.download += 1
      if (calls.missing) throw createError(404, 'Resume not found')
      return {
        ...resumeRecord(),
        downloadUrl:
          'https://res.cloudinary.com/example/image/upload/fl_attachment:Vadim-Iskakov-Resume/resume.pdf',
      }
    },
  }

  before(async () => {
    const environment = loadEnvironment({ NODE_ENV: 'test', CLIENT_ORIGINS: frontendOrigin })
    const app = createApp({ environment, authService, profileService })

    await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1')
      server.once('listening', resolve)
      server.once('error', reject)
    })
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  beforeEach(() => {
    calls = { signatures: 0, get: 0, replace: [], download: 0, missing: false }
  })

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('redirects the stable public endpoint to a cacheable provider attachment URL', async () => {
    const response = await fetch(`${baseUrl}/api/v1/profile/resume`, { redirect: 'manual' })

    assert.equal(response.status, 302)
    assert.equal(
      response.headers.get('location'),
      'https://res.cloudinary.com/example/image/upload/fl_attachment:Vadim-Iskakov-Resume/resume.pdf',
    )
    assert.equal(response.headers.get('cache-control'), 'public, max-age=0, s-maxage=60, stale-while-revalidate=300')
    assert.equal(response.headers.get('cdn-cache-control'), 'max-age=60, stale-while-revalidate=300')
  })

  it('does not cache public validation or missing-resume errors', async () => {
    const invalid = await requestJson(baseUrl, '/api/v1/profile/resume?download=false')
    assert.equal(invalid.response.status, 400)
    assert.equal(invalid.response.headers.get('cache-control'), null)

    calls.missing = true
    const missing = await requestJson(baseUrl, '/api/v1/profile/resume')
    assert.equal(missing.response.status, 404)
    assert.equal(missing.response.headers.get('cache-control'), null)
  })

  it('protects resume management and requires a trusted origin for writes', async () => {
    const unauthenticated = await requestJson(baseUrl, '/api/v1/admin/profile/resume')
    assert.equal(unauthenticated.response.status, 401)

    const missingOrigin = await requestJson(baseUrl, '/api/v1/admin/profile/resume', {
      method: 'PUT',
      headers: { cookie: sessionCookie, 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'cloudinary', providerAssetId: 'provider-id' }),
    })
    assert.equal(missingOrigin.response.status, 403)
  })

  it('returns a PDF upload signature without secrets', async () => {
    const { response, body } = await requestJson(
      baseUrl,
      '/api/v1/admin/profile/resume/upload-signature',
      {
        method: 'POST',
        headers: { cookie: sessionCookie, origin: frontendOrigin },
      },
    )

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(body.data.constraints.formats, ['pdf'])
    assert.equal(JSON.stringify(body).includes('private-secret'), false)
    assert.equal(calls.signatures, 1)
  })

  it('registers the managed PDF and returns an explicit admin representation', async () => {
    const payload = { provider: 'cloudinary', providerAssetId: 'provider-id' }
    const { response, body } = await requestJson(baseUrl, '/api/v1/admin/profile/resume', {
      method: 'PUT',
      headers: {
        cookie: sessionCookie,
        origin: frontendOrigin,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    assert.equal(response.status, 201)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(calls.replace.at(-1), payload)
    assert.deepEqual(body.data, {
      id: assetId.toString(),
      fileName: 'Vadim-Iskakov-Resume.pdf',
      format: 'pdf',
      bytes: 101_000,
      url: 'https://res.cloudinary.com/example/image/upload/resume.pdf',
      contentUpdatedAt: '2026-10-14T13:00:00.000Z',
    })

    const invalid = await requestJson(baseUrl, '/api/v1/admin/profile/resume', {
      method: 'PUT',
      headers: {
        cookie: sessionCookie,
        origin: frontendOrigin,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...payload, fileName: 'unsafe.pdf' }),
    })
    assert.equal(invalid.response.status, 400)
  })
})
