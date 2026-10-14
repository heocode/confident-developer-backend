import createError from 'http-errors'

const GITHUB_API_ORIGIN = 'https://api.github.com'
const GITHUB_API_VERSION = '2026-03-10'
const REQUEST_TIMEOUT_MS = 8_000

function providerError(status, message, failureCode) {
  const error = createError(status, message)
  error.githubFailureCode = failureCode
  return error
}

function validateGitHubUrl(value) {
  let url

  try {
    url = new URL(value)
  } catch {
    throw providerError(502, 'GitHub provider returned an invalid URL', 'provider-error')
  }

  if (url.origin !== GITHUB_API_ORIGIN || url.username || url.password) {
    throw providerError(502, 'GitHub provider returned an invalid URL', 'provider-error')
  }

  return url
}

function nextPageUrl(linkHeader) {
  if (!linkHeader) return null

  for (const entry of linkHeader.split(',')) {
    const match = entry.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/)
    if (match?.[2] === 'next') return validateGitHubUrl(match[1]).toString()
  }

  return null
}

function mapRequestError(error) {
  if (error?.githubFailureCode) return error
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return providerError(503, 'GitHub provider request timed out', 'timeout')
  }
  return providerError(502, 'GitHub provider request failed', 'provider-error')
}

function mapResponseError(response) {
  if (response.status === 404) {
    return providerError(502, 'Configured GitHub account was not found', 'not-found')
  }
  if (response.status === 403 || response.status === 429) {
    return providerError(503, 'GitHub provider rate limit was reached', 'rate-limited')
  }
  return providerError(502, 'GitHub provider request failed', 'provider-error')
}

export function createGitHubRestProvider(
  configuration,
  { fetchImplementation = fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {},
) {
  const baseHeaders = {
    accept: 'application/vnd.github+json',
    'user-agent': 'confident-developer-portfolio',
    'x-github-api-version': GITHUB_API_VERSION,
    ...(configuration?.token ? { authorization: `Bearer ${configuration.token}` } : {}),
  }

  async function requestJson(value, { etag } = {}) {
    let url = validateGitHubUrl(value)
    let response

    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      try {
        response = await fetchImplementation(url, {
          headers: { ...baseHeaders, ...(etag ? { 'if-none-match': etag } : {}) },
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (error) {
        throw mapRequestError(error)
      }

      if (![301, 302, 307, 308].includes(response.status)) break
      const location = response.headers.get('location')
      if (!location || redirectCount === 3) {
        throw providerError(502, 'GitHub provider returned invalid redirection', 'provider-error')
      }
      url = validateGitHubUrl(new URL(location, url).toString())
    }

    if (response.status === 304) return { response, body: null }
    if (!response.ok) throw mapResponseError(response)

    try {
      return { response, body: await response.json() }
    } catch {
      throw providerError(502, 'GitHub provider returned invalid JSON', 'provider-error')
    }
  }

  function requireConfiguration() {
    if (!configuration) {
      throw providerError(503, 'GitHub provider is not configured', 'provider-error')
    }
  }

  return {
    isConfigured: Boolean(configuration),

    async fetchSummary({ etag } = {}) {
      requireConfiguration()

      const repositories = []
      const visitedPages = new Set()
      let pageUrl = `${GITHUB_API_ORIGIN}/users/${encodeURIComponent(configuration.username)}/repos?type=owner&sort=full_name&direction=asc&per_page=100`
      let firstPageEtag
      let hasMultiplePages = false

      while (pageUrl) {
        if (visitedPages.has(pageUrl)) {
          throw providerError(502, 'GitHub provider returned invalid pagination', 'provider-error')
        }
        visitedPages.add(pageUrl)

        const { response, body } = await requestJson(pageUrl, {
          etag: visitedPages.size === 1 ? etag : undefined,
        })

        if (response.status === 304) {
          return { notModified: true, etag }
        }
        if (!Array.isArray(body)) {
          throw providerError(502, 'GitHub provider returned invalid repository data', 'provider-error')
        }

        if (visitedPages.size === 1) firstPageEtag = response.headers.get('etag') ?? undefined
        repositories.push(...body)
        pageUrl = nextPageUrl(response.headers.get('link'))
        if (pageUrl) hasMultiplePages = true
      }

      const ownedRepositories = repositories.filter((repository) => repository?.fork === false)
      const languages = new Set()

      for (const repository of ownedRepositories) {
        if (typeof repository.languages_url !== 'string') {
          throw providerError(502, 'GitHub provider returned invalid repository data', 'provider-error')
        }

        const { body } = await requestJson(repository.languages_url)
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          throw providerError(502, 'GitHub provider returned invalid language data', 'provider-error')
        }

        for (const [language, bytes] of Object.entries(body)) {
          if (language && Number.isFinite(bytes) && bytes > 0) languages.add(language)
        }
      }

      return {
        notModified: false,
        username: configuration.username,
        repositoryCount: ownedRepositories.length,
        languageCount: languages.size,
        etag: hasMultiplePages ? undefined : firstPageEtag,
      }
    },
  }
}
