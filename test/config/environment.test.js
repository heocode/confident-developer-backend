import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getPort, loadEnvironment } from '../../src/config/environment.js'

describe('environment configuration', () => {
  it('provides safe development defaults', () => {
    const environment = loadEnvironment({})

    assert.deepEqual(environment, {
      nodeEnv: 'development',
      port: 3000,
      mongodbUri: undefined,
      clientOrigins: ['http://localhost:5173'],
      trustProxy: false,
      enableCourseworkApi: false,
      cloudinary: null,
    })
  })

  it('normalizes explicit production settings', () => {
    const environment = loadEnvironment({
      NODE_ENV: 'production',
      PORT: '8080',
      MONGODB_URI: 'mongodb+srv://example.invalid/portfolio',
      CLIENT_ORIGINS: 'https://portfolio.example, https://admin.example,https://portfolio.example',
      TRUST_PROXY: '1',
      ENABLE_COURSEWORK_API: 'true',
    })

    assert.equal(environment.nodeEnv, 'production')
    assert.equal(environment.port, 8080)
    assert.deepEqual(environment.clientOrigins, ['https://portfolio.example', 'https://admin.example'])
    assert.equal(environment.trustProxy, 1)
    assert.equal(environment.enableCourseworkApi, true)
  })

  it('accepts the legacy singular client-origin setting', () => {
    const environment = loadEnvironment({ CLIENT_ORIGIN: 'http://localhost:4173' })

    assert.deepEqual(environment.clientOrigins, ['http://localhost:4173'])
  })

  it('loads Cloudinary credentials only when the complete configuration is present', () => {
    const environment = loadEnvironment({
      CLOUDINARY_CLOUD_NAME: 'portfolio-cloud',
      CLOUDINARY_API_KEY: 'public-key',
      CLOUDINARY_API_SECRET: 'private-secret',
    })

    assert.deepEqual(environment.cloudinary, {
      cloudName: 'portfolio-cloud',
      apiKey: 'public-key',
      apiSecret: 'private-secret',
    })
    assert.throws(
      () => loadEnvironment({ CLOUDINARY_CLOUD_NAME: 'portfolio-cloud' }),
      /must be configured together/,
    )
    assert.throws(
      () =>
        loadEnvironment({
          CLOUDINARY_CLOUD_NAME: 'invalid cloud',
          CLOUDINARY_API_KEY: 'key',
          CLOUDINARY_API_SECRET: 'secret',
        }),
      /invalid characters/,
    )
  })

  it('rejects missing or unsafe production settings', () => {
    assert.throws(() => loadEnvironment({ NODE_ENV: 'production' }), /CLIENT_ORIGINS is required/)
    assert.throws(() => loadEnvironment({ CLIENT_ORIGINS: '*' }), /invalid origin/)
    assert.throws(() => loadEnvironment({ CLIENT_ORIGINS: 'https://example.com/path' }), /invalid origin/)
    assert.throws(() => loadEnvironment({ TRUST_PROXY: 'true' }), /positive integer hop count/)
    assert.throws(() => loadEnvironment({ ENABLE_COURSEWORK_API: 'yes' }), /either true or false/)
  })

  it('rejects invalid ports', () => {
    assert.throws(() => getPort('0'), /between 1 and 65535/)
    assert.throws(() => getPort('not-a-port'), /between 1 and 65535/)
  })
})
