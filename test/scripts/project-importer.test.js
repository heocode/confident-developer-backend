import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import {
  buildImportPlan,
  buildProjectPayload,
  createImportApiClient,
  parseImportArguments,
} from '../../scripts/project-importer.js'

const temporaryDirectories = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

function pngHeader(width, height) {
  const buffer = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a', 'hex').copy(buffer)
  buffer.write('IHDR', 12, 'ascii')
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}

function minimalManifest(assetPath = 'asset.png') {
  return {
    version: 1,
    assets: {
      shared: { path: assetPath, alt: 'Shared project image' },
    },
    projects: [
      {
        content: {
          slug: 'example',
          title: 'Example',
          status: 'draft',
          timeline: { startDate: '2026-06-01', endDate: null },
        },
        media: {
          logo: 'shared',
          homePreview: 'shared',
          screenshots: [{ asset: 'shared', alt: 'Example screenshot' }],
        },
      },
    ],
  }
}

describe('project importer', () => {
  it('validates local PNG metadata and builds an offline import plan', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'project-importer-'))
    temporaryDirectories.push(directory)
    await writeFile(join(directory, 'asset.png'), pngHeader(632, 1119))

    const plan = await buildImportPlan(minimalManifest(), { workspaceRoot: directory })

    assert.equal(plan.assets.length, 1)
    assert.equal(plan.assets[0].width, 632)
    assert.equal(plan.assets[0].height, 1119)
    assert.match(plan.assets[0].sha256, /^[a-f\d]{64}$/)
    assert.equal(plan.projects[0].content.slug, 'example')

    const payload = buildProjectPayload(plan.projects[0], { shared: '68e6d0000000000000000001' })
    assert.equal(payload.timeline.startDate.toISOString(), '2026-06-01T00:00:00.000Z')
  })

  it('preserves stable nested IDs when rebuilding an existing draft', () => {
    const project = {
      content: {
        slug: 'example',
        title: 'Example',
        status: 'draft',
        buildBreakdown: [{ label: 'Development', percentage: 100 }],
        links: [{ icon: 'website', label: 'Website', url: 'https://example.com' }],
      },
      media: {
        logo: 'logo',
        homePreview: 'preview',
        screenshots: [{ asset: 'screenshot', alt: 'Example screenshot' }],
      },
    }
    const existing = {
      buildBreakdown: [{ id: '68e6d0000000000000000001', label: 'Development', percentage: 80 }],
      links: [
        {
          id: '68e6d0000000000000000002',
          icon: 'website',
          label: 'Website',
          url: 'https://old.example.com',
        },
      ],
      screenshots: [
        {
          id: '68e6d0000000000000000003',
          asset: '68e6d0000000000000000013',
          alt: 'Old screenshot alt',
        },
      ],
    }
    const payload = buildProjectPayload(
      project,
      {
        logo: '68e6d0000000000000000011',
        preview: '68e6d0000000000000000012',
        screenshot: '68e6d0000000000000000013',
      },
      existing,
    )

    assert.equal(payload.buildBreakdown[0].id, existing.buildBreakdown[0].id)
    assert.equal(payload.links[0].id, existing.links[0].id)
    assert.equal(payload.screenshots[0].id, existing.screenshots[0].id)
    assert.equal(payload.buildBreakdown[0].percentage, 100)
    assert.equal(payload.screenshots[0].alt, 'Example screenshot')
  })

  it('accepts only explicit safe CLI options', () => {
    assert.deepEqual(parseImportArguments(['--dry-run']), {
      dryRun: true,
      baseUrl: 'http://localhost:3000',
      origin: 'http://localhost:5173',
    })
    assert.deepEqual(
      parseImportArguments([
        '--base-url=https://api.example.com',
        '--origin',
        'https://portfolio.example.com',
      ]),
      {
        dryRun: false,
        baseUrl: 'https://api.example.com',
        origin: 'https://portfolio.example.com',
      },
    )
    assert.throws(() => parseImportArguments(['--base-url=http://api.example.com']), /HTTPS or local HTTP/)
    assert.throws(() => parseImportArguments(['--password=secret']), /Unknown argument/)
  })

  it('uses the authenticated HTTP contracts and keeps the session cookie away from Cloudinary', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'project-importer-'))
    temporaryDirectories.push(directory)
    const assetPath = join(directory, 'asset.png')
    await writeFile(assetPath, pngHeader(10, 20))

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
      if (url.endsWith('/admin/projects')) {
        return jsonResponse({ success: true, data: [] })
      }
      if (url.endsWith('/admin/media/upload-signature')) {
        return jsonResponse({
          success: true,
          data: {
            provider: 'cloudinary',
            upload: {
              method: 'POST',
              url: 'https://api.cloudinary.com/upload',
              fields: { signature: 'signed' },
            },
          },
        })
      }
      if (url === 'https://api.cloudinary.com/upload') {
        return jsonResponse({ asset_id: 'provider-asset-id' })
      }
      if (url.endsWith('/admin/media')) {
        return jsonResponse({ success: true, data: { id: '68e6d0000000000000000001' } }, { status: 201 })
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
    await api.listProjects()
    const descriptor = await api.createUploadDescriptor()
    const uploaded = await api.uploadToProvider(descriptor, {
      absolutePath: assetPath,
      filename: 'asset.png',
    })
    await api.registerMediaAsset({ ...uploaded, alt: 'Accessible project image' })
    await api.logout()

    assert.equal(calls[0].options.headers.origin, 'https://portfolio.example.com')
    assert.equal(calls[1].options.headers.cookie, 'cd_admin_session=opaque-token')
    assert.equal(calls[2].options.headers.cookie, 'cd_admin_session=opaque-token')
    assert.equal(calls[3].options.headers, undefined)
    assert.equal(calls[4].options.headers.cookie, 'cd_admin_session=opaque-token')
    assert.equal(calls[5].options.headers.cookie, 'cd_admin_session=opaque-token')
  })
})
