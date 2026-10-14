import createError from 'http-errors'

import { GitHubSnapshot } from './github-snapshot.js'

const SNAPSHOT_KEY = 'portfolio'
const DEFAULT_STALE_AFTER_MS = 6 * 60 * 60 * 1_000

function asPlainObject(value) {
  return typeof value?.toObject === 'function' ? value.toObject() : value
}

function isStale(snapshot, now, staleAfterMs) {
  return now.getTime() - new Date(snapshot.refreshedAt).getTime() >= staleAfterMs
}

export function createGitHubService({
  snapshotModel = GitHubSnapshot,
  githubProvider,
  now = () => new Date(),
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
  logger = console,
} = {}) {
  let refreshInFlight = null

  async function findSnapshot() {
    const query = snapshotModel.findOne({ key: SNAPSHOT_KEY })
    return typeof query?.lean === 'function' ? query.lean() : query
  }

  async function performRefresh() {
    const attemptedAt = now()
    const existing = await findSnapshot()

    try {
      const result = await githubProvider.fetchSummary({ etag: existing?.sourceEtag })
      const update = result.notModified
        ? {
            $set: { refreshedAt: attemptedAt, lastAttemptAt: attemptedAt },
            $unset: { lastFailureAt: 1, lastFailureCode: 1 },
          }
        : {
            $set: {
              username: result.username,
              repositoryCount: result.repositoryCount,
              languageCount: result.languageCount,
              refreshedAt: attemptedAt,
              lastAttemptAt: attemptedAt,
              ...(result.etag ? { sourceEtag: result.etag } : {}),
            },
            $unset: {
              lastFailureAt: 1,
              lastFailureCode: 1,
              ...(result.etag ? {} : { sourceEtag: 1 }),
            },
            $setOnInsert: { key: SNAPSHOT_KEY },
          }

      const snapshot = await snapshotModel.findOneAndUpdate({ key: SNAPSHOT_KEY }, update, {
        upsert: !result.notModified,
        returnDocument: 'after',
        runValidators: true,
      })

      if (!snapshot) throw createError(503, 'GitHub snapshot is unavailable')
      return snapshot
    } catch (error) {
      await snapshotModel.updateOne(
        { key: SNAPSHOT_KEY },
        {
          $set: {
            lastAttemptAt: attemptedAt,
            lastFailureAt: attemptedAt,
            lastFailureCode: error.githubFailureCode ?? 'provider-error',
          },
        },
      )
      throw error
    }
  }

  function refreshSnapshot() {
    if (refreshInFlight) return refreshInFlight

    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null
    })
    return refreshInFlight
  }

  return {
    refreshSnapshot,

    async getSummary() {
      const snapshot = await findSnapshot()
      if (!snapshot) throw createError(503, 'GitHub summary is unavailable')

      if (isStale(snapshot, now(), staleAfterMs)) {
        void refreshSnapshot().catch((error) => {
          logger.warn('Background GitHub refresh failed.', {
            code: error.githubFailureCode ?? 'provider-error',
          })
        })
      }

      return asPlainObject(snapshot)
    },
  }
}
