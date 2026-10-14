import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { GitHubSnapshot } from '../../../src/modules/github/github-snapshot.js'

function hasIndex(model, fields, expectedOptions = {}) {
  return model.schema.indexes().some(([indexFields, options]) => {
    const fieldsMatch = JSON.stringify(indexFields) === JSON.stringify(fields)
    const optionsMatch = Object.entries(expectedOptions).every(
      ([key, value]) => JSON.stringify(options[key]) === JSON.stringify(value),
    )
    return fieldsMatch && optionsMatch
  })
}

describe('GitHubSnapshot model', () => {
  it('stores a valid singleton snapshot in its production collection', async () => {
    const snapshot = new GitHubSnapshot({
      key: 'portfolio',
      username: 'Heoposit',
      repositoryCount: 4,
      languageCount: 4,
      refreshedAt: '2026-10-14T12:00:00.000Z',
      lastAttemptAt: '2026-10-14T12:00:00.000Z',
    })

    await snapshot.validate()

    assert.equal(GitHubSnapshot.collection.collectionName, 'github_snapshots')
    assert.equal(snapshot.username, 'heoposit')
    assert.equal(hasIndex(GitHubSnapshot, { key: 1 }, { unique: true }), true)
  })

  it('rejects negative or fractional counts and unsupported failure states', async () => {
    const snapshot = new GitHubSnapshot({
      key: 'portfolio',
      username: 'heoposit',
      repositoryCount: -1,
      languageCount: 1.5,
      refreshedAt: new Date(),
      lastAttemptAt: new Date(),
      lastFailureCode: 'raw-provider-message',
    })

    await assert.rejects(snapshot.validate(), (error) => {
      assert.ok(error.errors.repositoryCount)
      assert.ok(error.errors.languageCount)
      assert.ok(error.errors.lastFailureCode)
      return true
    })
  })
})
