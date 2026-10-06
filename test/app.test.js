import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { createApp } from '../src/app.js'

describe('Express application', () => {
  let baseUrl
  let server

  before(async () => {
    await new Promise((resolve, reject) => {
      server = createApp().listen(0, '127.0.0.1')
      server.once('listening', resolve)
      server.once('error', reject)
    })

    const address = server.address()
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('returns a successful health response', async () => {
    const response = await fetch(`${baseUrl}/api/health`)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(body, {
      success: true,
      message: 'API is healthy.',
      data: {
        database: 'disconnected',
      },
    })
  })

  it('returns the shared error shape for an unknown route', async () => {
    const response = await fetch(`${baseUrl}/not-found`)
    const body = await response.json()

    assert.equal(response.status, 404)
    assert.deepEqual(body, {
      success: false,
      message: 'Route not found',
    })
  })
})
