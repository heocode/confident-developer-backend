import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { serviceImportManifest } from '../../scripts/service-import-manifest.js'
import { buildServiceImportPlan, buildServicePayload } from '../../scripts/service-importer.js'
import { createImportApiClient } from '../../scripts/utils/import-api-client.js'

describe('service importer', () => {
  it('validates the approved four-service manifest offline', () => {
    const plan = buildServiceImportPlan(serviceImportManifest)

    assert.equal(plan.services.length, 4)
    assert.deepEqual(
      plan.services.map(({ slug, icon, tone }) => ({ slug, icon, tone })),
      [
        { slug: 'product-ui-ux', icon: 'product-ui-ux', tone: 'product' },
        { slug: 'mobile-development', icon: 'mobile-development', tone: 'mobile' },
        { slug: 'web-development', icon: 'web-development', tone: 'web' },
        { slug: 'backend-architecture', icon: 'backend-development', tone: 'backend' },
      ],
    )
  })

  it('builds create and update payloads as drafts', () => {
    const service = buildServiceImportPlan(serviceImportManifest).services[0]

    assert.equal(buildServicePayload(service).status, 'draft')
    assert.equal(buildServicePayload(service, { id: '68e7c0000000000000000001' }).status, 'draft')
  })

  it('rejects duplicate slugs and display orders', () => {
    const duplicateSlug = structuredClone(serviceImportManifest)
    duplicateSlug.services[1].slug = duplicateSlug.services[0].slug
    assert.throws(() => buildServiceImportPlan(duplicateSlug), /Duplicate service slug/)

    const duplicateOrder = structuredClone(serviceImportManifest)
    duplicateOrder.services[1].home.order = duplicateOrder.services[0].home.order
    assert.throws(() => buildServiceImportPlan(duplicateOrder), /Duplicate Home order/)
  })

  it('uses the protected service HTTP contracts through the shared importer client', async () => {
    const calls = []
    const jsonResponse = (body, init) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { 'content-type': 'application/json', ...init?.headers },
      })
    const fetchImplementation = async (url, options) => {
      calls.push({ url, options })

      if (url.endsWith('/auth/login')) {
        return jsonResponse(
          { success: true, data: { id: 'admin-id', displayName: 'Owner' } },
          { headers: { 'set-cookie': 'cd_admin_session=opaque-token; HttpOnly; Path=/api/v1' } },
        )
      }
      if (url.endsWith('/admin/services') && options.method === 'GET') {
        return jsonResponse({ success: true, data: [] })
      }
      if (url.endsWith('/admin/services') && options.method === 'POST') {
        return jsonResponse({ success: true, data: { id: 'service-id', slug: 'example' } }, { status: 201 })
      }
      if (url.endsWith('/admin/services/service-id') && options.method === 'PATCH') {
        return jsonResponse({ success: true, data: { id: 'service-id', slug: 'example' } })
      }
      if (url.endsWith('/auth/logout')) return jsonResponse({ success: true })
      throw new Error(`Unexpected test request: ${url}`)
    }
    const api = createImportApiClient({
      baseUrl: 'https://api.example.com',
      origin: 'https://portfolio.example.com',
      fetchImplementation,
    })

    await api.login({ email: 'owner@example.com', password: 'not-a-real-password' })
    await api.listServices()
    await api.createService({ slug: 'example', title: 'Example' })
    await api.updateService('service-id', { status: 'published' })
    await api.logout()

    assert.deepEqual(
      calls.map(({ url, options }) => [url, options.method]),
      [
        ['https://api.example.com/api/v1/auth/login', 'POST'],
        ['https://api.example.com/api/v1/admin/services', 'GET'],
        ['https://api.example.com/api/v1/admin/services', 'POST'],
        ['https://api.example.com/api/v1/admin/services/service-id', 'PATCH'],
        ['https://api.example.com/api/v1/auth/logout', 'POST'],
      ],
    )
    assert.equal(calls[1].options.headers.cookie, 'cd_admin_session=opaque-token')
    assert.equal(calls[2].options.headers.origin, 'https://portfolio.example.com')
    assert.equal(calls[3].options.headers.origin, 'https://portfolio.example.com')
  })
})
