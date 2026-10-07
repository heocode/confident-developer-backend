import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import mongoose from 'mongoose'

import { createApp } from '../src/app.js'
import { Project } from '../src/models/project.js'
import { Reference } from '../src/models/reference.js'
import { Service } from '../src/models/service.js'
import { User } from '../src/models/user.js'

const models = [Reference, Project, Service, User]

function invalidIdError(value) {
  return new mongoose.Error.CastError('ObjectId', value, '_id')
}

function assertValidId(value) {
  if (!mongoose.isObjectIdOrHexString(value)) throw invalidIdError(value)
}

function installInMemoryModel(model) {
  const documents = new Map()
  const originalMethods = Object.fromEntries(
    ['create', 'find', 'findById', 'findByIdAndUpdate', 'findByIdAndDelete'].map((method) => [method, model[method]]),
  )

  model.create = async (input) => {
    const document = new model(input)
    await document.validate()
    documents.set(document.id, document)
    return document
  }

  model.find = () => ({
    sort: async () => [...documents.values()].sort((left, right) => left.id.localeCompare(right.id)),
  })

  model.findById = async (id) => {
    assertValidId(id)
    return documents.get(id) ?? null
  }

  model.findByIdAndUpdate = async (id, update) => {
    assertValidId(id)
    const document = documents.get(id)

    if (!document) return null

    document.set(update.$set)
    await document.validate()
    return document
  }

  model.findByIdAndDelete = async (id) => {
    assertValidId(id)
    const document = documents.get(id) ?? null
    documents.delete(id)
    return document
  }

  return {
    documents,
    restore() {
      Object.assign(model, originalMethods)
    },
  }
}

async function requestJson(baseUrl, path, options = {}) {
  const headers = options.body ? { 'content-type': 'application/json', ...options.headers } : options.headers
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers })
  const body = await response.json()

  return { response, body }
}

function assertPublicDocument(document) {
  assert.equal(typeof document.id, 'string')
  assert.equal('_id' in document, false)
  assert.equal('__v' in document, false)
}

describe('coursework CRUD API', () => {
  const adapters = new Map()
  let baseUrl
  let server

  before(async () => {
    for (const model of models) adapters.set(model, installInMemoryModel(model))

    await new Promise((resolve, reject) => {
      server = createApp({ enableCourseworkApi: true }).listen(0, '127.0.0.1')
      server.once('listening', resolve)
      server.once('error', reject)
    })

    const address = server.address()
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  after(async () => {
    for (const adapter of adapters.values()) adapter.restore()

    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('runs the supplied reference payload through create, list, get, update, and delete', async () => {
    const createResult = await requestJson(baseUrl, '/api/references', {
      method: 'POST',
      body: JSON.stringify({
        firstname: 'Clark',
        lastname: 'Kent',
        firstName: 'Clark',
        lastName: 'Kent',
        email: 'clark.kent@dailyplanet.com',
        company: 'Daily Planet',
        position: 'Reporter',
      }),
    })

    assert.equal(createResult.response.status, 201)
    assert.equal(createResult.body.success, true)
    assert.equal(createResult.body.data.name, 'Clark Kent')
    assert.equal(createResult.body.data.testimonial, 'Reference provided by Clark Kent.')
    assertPublicDocument(createResult.body.data)
    const id = createResult.body.data.id

    const listResult = await requestJson(baseUrl, '/api/references')
    assert.equal(listResult.response.status, 200)
    assert.equal(listResult.body.data.at(-1).id, id)

    const getResult = await requestJson(baseUrl, `/api/references/${id}`)
    assert.equal(getResult.body.data.id, id)

    const updateResult = await requestJson(baseUrl, `/api/references/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ firstname: 'Bruce', lastname: 'Wayne', email: 'bruce.wayne@waynecorp.com' }),
    })
    assert.deepEqual(updateResult.body, { success: true, message: 'Reference updated successfully.' })

    const updatedResult = await requestJson(baseUrl, `/api/references/${id}`)
    assert.equal(updatedResult.body.data.name, 'Bruce Wayne')
    assert.equal(updatedResult.body.data.company, 'Daily Planet')

    const deleteResult = await requestJson(baseUrl, `/api/references/${id}`, { method: 'DELETE' })
    assert.deepEqual(deleteResult.body, { success: true, message: 'Reference deleted successfully.' })

    const missingResult = await requestJson(baseUrl, `/api/references/${id}`)
    assert.equal(missingResult.response.status, 404)
    assert.deepEqual(missingResult.body, { success: false, message: 'Reference not found' })
  })

  it('accepts the supplied project payload and provides its missing required image', async () => {
    const createResult = await requestJson(baseUrl, '/api/projects/', {
      method: 'POST',
      body: JSON.stringify({
        title: 'COMP229 - Assignment 02',
        completion: '2025-10-31',
        description: 'This Assignment is about backend API.',
      }),
    })

    assert.equal(createResult.response.status, 201)
    assert.equal(createResult.body.data.image, '/images/project-placeholder.webp')
    assertPublicDocument(createResult.body.data)
    const id = createResult.body.data.id

    const updateResult = await requestJson(baseUrl, `/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: 'COMP229 - Assignment 02',
        completion: '2025-10-31',
        description: 'This Assignment is all about backend API. Submitted before due date.',
      }),
    })
    assert.deepEqual(updateResult.body, { success: true, message: 'Project updated successfully.' })

    const listResult = await requestJson(baseUrl, '/api/projects')
    assert.equal(listResult.body.data.at(-1).id, id)

    const deleteResult = await requestJson(baseUrl, `/api/projects/${id}`, { method: 'DELETE' })
    assert.equal(deleteResult.response.status, 200)
  })

  it('implements the complete services contract', async () => {
    const createResult = await requestJson(baseUrl, '/api/services', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Web Application Development',
        description: 'Development of your web app using the MERN stack.',
      }),
    })

    assert.equal(createResult.response.status, 201)
    assertPublicDocument(createResult.body.data)
    const id = createResult.body.data.id

    const getResult = await requestJson(baseUrl, `/api/services/${id}`)
    assert.equal(getResult.body.data.title, 'Web Application Development')

    const updateResult = await requestJson(baseUrl, `/api/services/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title: 'MEARN - Web Application Development' }),
    })
    assert.equal(updateResult.body.data, undefined)
    assert.equal(updateResult.body.success, true)

    const listResult = await requestJson(baseUrl, '/api/services')
    assert.equal(listResult.body.data.at(-1).id, id)

    const deleteResult = await requestJson(baseUrl, `/api/services/${id}`, { method: 'DELETE' })
    assert.equal(deleteResult.body.success, true)
  })

  it('normalizes user aliases, hashes passwords, and redacts hashes from every response', async () => {
    const createResult = await requestJson(baseUrl, '/api/users', {
      method: 'POST',
      body: JSON.stringify({
        firstname: 'Clark',
        lastname: 'Kent',
        firstName: 'Clark',
        lastName: 'Kent',
        email: 'clark.kent@dailyplanet.com',
        password: '12345678',
        username: 'clark.kent2',
        created: '2023-04-01T00:00:00Z',
        updated: '2023-04-01T00:00:00Z',
        role: 'admin',
      }),
    })

    assert.equal(createResult.response.status, 201)
    assert.equal(createResult.body.data.firstname, 'Clark')
    assert.equal('password' in createResult.body.data, false)
    assertPublicDocument(createResult.body.data)
    const id = createResult.body.data.id
    const storedUser = adapters.get(User).documents.get(id)
    assert.notEqual(storedUser.password, '12345678')
    assert.match(storedUser.password, /^\$2[aby]\$/)

    const listResult = await requestJson(baseUrl, '/api/users')
    assert.equal(listResult.body.data.at(-1).id, id)
    assert.equal('password' in listResult.body.data.at(-1), false)

    const updateResult = await requestJson(baseUrl, `/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ firstname: 'Bruce', lastname: 'Wayne', email: 'bruce.wayne@waynecorp.com' }),
    })
    assert.deepEqual(updateResult.body, { success: true, message: 'User updated successfully.' })

    const getResult = await requestJson(baseUrl, `/api/users/${id}`)
    assert.equal(getResult.body.data.firstname, 'Bruce')
    assert.equal('password' in getResult.body.data, false)

    const deleteResult = await requestJson(baseUrl, `/api/users/${id}`, { method: 'DELETE' })
    assert.equal(deleteResult.body.success, true)
  })

  it('returns consistent errors for validation failures and malformed IDs', async () => {
    const validationResult = await requestJson(baseUrl, '/api/services', {
      method: 'POST',
      body: JSON.stringify({ title: 'Missing description' }),
    })
    assert.equal(validationResult.response.status, 400)
    assert.equal(validationResult.body.success, false)
    assert.match(validationResult.body.message, /^Validation failed:/)

    const invalidDateResult = await requestJson(baseUrl, '/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Invalid completion date',
        completion: 'not-a-date',
        description: 'Invalid date must be a client error.',
        image: '/test.webp',
      }),
    })
    assert.equal(invalidDateResult.response.status, 400)
    assert.deepEqual(invalidDateResult.body, {
      success: false,
      message: 'Validation failed: Invalid value for completion',
    })

    const malformedIdResult = await requestJson(baseUrl, '/api/projects/not-an-object-id')
    assert.equal(malformedIdResult.response.status, 400)
    assert.deepEqual(malformedIdResult.body, { success: false, message: 'Invalid resource ID' })

    const emptyUpdateResult = await requestJson(baseUrl, `/api/projects/${new mongoose.Types.ObjectId()}`, {
      method: 'PUT',
      body: JSON.stringify({}),
    })
    assert.equal(emptyUpdateResult.response.status, 400)
    assert.equal(emptyUpdateResult.body.message, 'At least one updatable field is required')

    const weakPasswordResult = await requestJson(baseUrl, '/api/users', {
      method: 'POST',
      body: JSON.stringify({
        firstname: 'Lois',
        lastname: 'Lane',
        email: 'lois.lane@dailyplanet.com',
        password: 'short',
      }),
    })
    assert.equal(weakPasswordResult.response.status, 400)
    assert.equal(weakPasswordResult.body.message, 'Password must contain between 8 and 72 UTF-8 bytes')
  })

  it('converts database failures to the shared error response', async () => {
    const originalFind = Service.find
    const originalConsoleError = console.error
    Service.find = () => ({ sort: async () => Promise.reject(new Error('database unavailable')) })
    console.error = () => {}

    try {
      const result = await requestJson(baseUrl, '/api/services')
      assert.equal(result.response.status, 500)
      assert.deepEqual(result.body, { success: false, message: 'database unavailable' })
    } finally {
      Service.find = originalFind
      console.error = originalConsoleError
    }
  })
})
