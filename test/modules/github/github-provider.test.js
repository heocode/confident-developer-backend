import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createGitHubRestProvider } from '../../../src/modules/github/providers/github-rest-provider.js'

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(status === 304 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

describe('GitHub REST provider', () => {
  it('counts non-fork repositories and all unique reported languages sequentially', async () => {
    const calls = []
    const fetchImplementation = async (url, options) => {
      calls.push({ url: url.toString(), options })
      if (url.pathname === '/users/heoposit/repos') {
        return jsonResponse(
          [
            {
              fork: false,
              languages_url: 'https://api.github.com/repos/heoposit/backend/languages',
            },
            {
              fork: true,
              languages_url: 'https://api.github.com/repos/heoposit/fork/languages',
            },
            {
              fork: false,
              languages_url: 'https://api.github.com/repos/heoposit/frontend/languages',
            },
          ],
          { headers: { etag: '"repository-etag"' } },
        )
      }
      if (url.pathname.endsWith('/backend/languages')) {
        return jsonResponse({ JavaScript: 1000, Dockerfile: 20 })
      }
      if (url.pathname.endsWith('/frontend/languages')) {
        return jsonResponse({ TypeScript: 900, JavaScript: 100, CSS: 0 })
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    const provider = createGitHubRestProvider(
      { username: 'heoposit', token: 'read-only-token' },
      { fetchImplementation },
    )

    const summary = await provider.fetchSummary()

    assert.deepEqual(summary, {
      notModified: false,
      username: 'heoposit',
      repositoryCount: 2,
      languageCount: 3,
      etag: '"repository-etag"',
    })
    assert.equal(calls.length, 3)
    assert.equal(calls[0].options.headers.authorization, 'Bearer read-only-token')
    assert.equal(calls[0].options.headers.accept, 'application/vnd.github+json')
    assert.equal(calls.some(({ url }) => url.includes('/fork/languages')), false)
  })

  it('follows validated pagination and disables a partial-list ETag', async () => {
    const calls = []
    const fetchImplementation = async (url) => {
      calls.push(url.toString())
      if (url.searchParams.get('page') === '2') return jsonResponse([])
      return jsonResponse([], {
        headers: {
          etag: '"page-one"',
          link: '<https://api.github.com/users/heoposit/repos?type=owner&per_page=100&page=2>; rel="next"',
        },
      })
    }
    const provider = createGitHubRestProvider({ username: 'heoposit' }, { fetchImplementation })

    const summary = await provider.fetchSummary()

    assert.equal(calls.length, 2)
    assert.equal(summary.etag, undefined)
  })

  it('uses a saved ETag and accepts a not-modified response without language calls', async () => {
    const calls = []
    const provider = createGitHubRestProvider(
      { username: 'heoposit' },
      {
        fetchImplementation: async (url, options) => {
          calls.push({ url, options })
          return jsonResponse(null, { status: 304 })
        },
      },
    )

    const summary = await provider.fetchSummary({ etag: '"saved-etag"' })

    assert.deepEqual(summary, { notModified: true, etag: '"saved-etag"' })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].options.headers['if-none-match'], '"saved-etag"')
    assert.equal('authorization' in calls[0].options.headers, false)
  })

  it('fails safely for missing configuration, rate limits, and untrusted provider URLs', async () => {
    const unconfigured = createGitHubRestProvider(null)
    await assert.rejects(unconfigured.fetchSummary(), (error) => error.status === 503)

    const rateLimited = createGitHubRestProvider(
      { username: 'heoposit' },
      { fetchImplementation: async () => jsonResponse({}, { status: 429 }) },
    )
    await assert.rejects(rateLimited.fetchSummary(), (error) => {
      assert.equal(error.status, 503)
      assert.equal(error.githubFailureCode, 'rate-limited')
      assert.equal(error.message.includes('token'), false)
      return true
    })

    const untrustedLanguageUrl = createGitHubRestProvider(
      { username: 'heoposit', token: 'must-not-leak' },
      {
        fetchImplementation: async () =>
          jsonResponse([{ fork: false, languages_url: 'https://attacker.example/languages' }]),
      },
    )
    await assert.rejects(
      untrustedLanguageUrl.fetchSummary(),
      (error) => error.status === 502 && error.githubFailureCode === 'provider-error',
    )
  })

  it('maps timeouts to a safe availability error', async () => {
    const provider = createGitHubRestProvider(
      { username: 'heoposit', token: 'must-not-leak' },
      {
        fetchImplementation: async () => {
          const error = new Error('request aborted with secret context')
          error.name = 'TimeoutError'
          throw error
        },
      },
    )

    await assert.rejects(provider.fetchSummary(), (error) => {
      assert.equal(error.status, 503)
      assert.equal(error.githubFailureCode, 'timeout')
      assert.equal(error.message, 'GitHub provider request timed out')
      return true
    })
  })
})
