import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import createError from 'http-errors'

import { createGitHubService } from '../../../src/modules/github/github-service.js'

function applyUpdate(target, update) {
  const next = { ...(target ? {} : update.$setOnInsert), ...(target ?? {}), ...(update.$set ?? {}) }
  for (const key of Object.keys(update.$unset ?? {})) delete next[key]
  return next
}

function createSnapshotModel(initialSnapshot = null) {
  const state = { snapshot: initialSnapshot, updates: [] }
  return {
    state,
    model: {
      findOne() {
        return { lean: async () => state.snapshot }
      },
      async findOneAndUpdate(_filter, update, options) {
        state.updates.push({ type: 'replace', update, options })
        if (!state.snapshot && !options.upsert) return null
        state.snapshot = applyUpdate(state.snapshot, update)
        return state.snapshot
      },
      async updateOne(_filter, update) {
        state.updates.push({ type: 'failure', update })
        if (state.snapshot) state.snapshot = applyUpdate(state.snapshot, update)
      },
    },
  }
}

function snapshot(overrides = {}) {
  return {
    key: 'portfolio',
    username: 'heoposit',
    repositoryCount: 4,
    languageCount: 4,
    sourceEtag: '"etag"',
    refreshedAt: new Date('2026-10-14T12:00:00.000Z'),
    lastAttemptAt: new Date('2026-10-14T12:00:00.000Z'),
    ...overrides,
  }
}

describe('GitHub snapshot service', () => {
  it('returns a fresh snapshot without contacting GitHub', async () => {
    const { model } = createSnapshotModel(snapshot())
    let providerCalls = 0
    const service = createGitHubService({
      snapshotModel: model,
      githubProvider: { async fetchSummary() { providerCalls += 1 } },
      now: () => new Date('2026-10-14T13:00:00.000Z'),
    })

    const result = await service.getSummary()

    assert.equal(result.repositoryCount, 4)
    assert.equal(providerCalls, 0)
  })

  it('returns stale data immediately and shares one background refresh', async () => {
    const { model, state } = createSnapshotModel(snapshot())
    let providerCalls = 0
    let releaseProvider
    const providerResult = new Promise((resolve) => {
      releaseProvider = resolve
    })
    const service = createGitHubService({
      snapshotModel: model,
      githubProvider: {
        async fetchSummary() {
          providerCalls += 1
          return providerResult
        },
      },
      now: () => new Date('2026-10-15T12:00:00.000Z'),
      logger: { warn() {} },
    })

    const staleResult = await service.getSummary()
    const sharedRefresh = service.refreshSnapshot()
    assert.equal(staleResult.repositoryCount, 4)
    releaseProvider({
      notModified: false,
      username: 'heoposit',
      repositoryCount: 5,
      languageCount: 6,
      etag: '"new-etag"',
    })
    await sharedRefresh

    assert.equal(providerCalls, 1)
    assert.equal(state.snapshot.repositoryCount, 5)
    assert.equal(state.snapshot.languageCount, 6)
  })

  it('updates freshness after a 304 without replacing counts', async () => {
    const { model, state } = createSnapshotModel(snapshot())
    const service = createGitHubService({
      snapshotModel: model,
      githubProvider: { async fetchSummary() { return { notModified: true, etag: '"etag"' } } },
      now: () => new Date('2026-10-15T12:00:00.000Z'),
    })

    await service.refreshSnapshot()

    assert.equal(state.snapshot.repositoryCount, 4)
    assert.equal(state.snapshot.refreshedAt.toISOString(), '2026-10-15T12:00:00.000Z')
  })

  it('retains successful data and records only a safe failure code', async () => {
    const { model, state } = createSnapshotModel(snapshot())
    const providerFailure = createError(503, 'Safe provider error')
    providerFailure.githubFailureCode = 'rate-limited'
    const service = createGitHubService({
      snapshotModel: model,
      githubProvider: { async fetchSummary() { throw providerFailure } },
      now: () => new Date('2026-10-15T12:00:00.000Z'),
    })

    await assert.rejects(service.refreshSnapshot(), providerFailure)

    assert.equal(state.snapshot.repositoryCount, 4)
    assert.equal(state.snapshot.lastFailureCode, 'rate-limited')
    assert.equal(state.snapshot.lastFailureAt.toISOString(), '2026-10-15T12:00:00.000Z')
  })

  it('returns 503 without making a public request depend on a missing snapshot', async () => {
    const { model } = createSnapshotModel()
    let providerCalls = 0
    const service = createGitHubService({
      snapshotModel: model,
      githubProvider: { async fetchSummary() { providerCalls += 1 } },
    })

    await assert.rejects(service.getSummary(), (error) => error.status === 503)
    assert.equal(providerCalls, 0)
  })
})
