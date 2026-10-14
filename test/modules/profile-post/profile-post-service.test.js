import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import mongoose from 'mongoose'

import { ProfilePostLike } from '../../../src/modules/profile-post/profile-post-like.js'
import { createProfilePostService } from '../../../src/modules/profile-post/profile-post-service.js'
import { ProfilePostView } from '../../../src/modules/profile-post/profile-post-view.js'
import { ProfilePost } from '../../../src/modules/profile-post/profile-post.js'
import {
  getVisitorCookie,
  hashVisitorToken,
} from '../../../src/modules/profile-post/visitor-cookie.js'

const postId = new mongoose.Types.ObjectId('68f000000000000000000001')

function hasIndex(model, fields, expectedOptions = {}) {
  return model.schema.indexes().some(([indexFields, options]) => {
    const fieldsMatch = JSON.stringify(indexFields) === JSON.stringify(fields)
    const optionsMatch = Object.entries(expectedOptions).every(([key, value]) => options[key] === value)
    return fieldsMatch && optionsMatch
  })
}

function sessionResult(value) {
  return {
    session() {
      return Promise.resolve(value)
    },
    then(resolve, reject) {
      return Promise.resolve(value).then(resolve, reject)
    },
  }
}

function duplicateKeyError() {
  return Object.assign(new Error('duplicate'), { code: 11_000 })
}

function createHarness({ existingPost = null } = {}) {
  const state = {
    post: existingPost,
    likes: new Set(),
    views: new Map(),
    now: new Date('2026-10-14T12:00:00.000Z'),
    deletedLikes: 0,
    deletedViews: 0,
  }

  function attachSave(post) {
    post.save = async () => {
      state.post = post
      return post
    }
    return post
  }

  function PostModel(values) {
    return attachSave({ _id: postId, ...values })
  }
  PostModel.findOne = () => sessionResult(state.post)

  const likeModel = {
    findOne({ visitorHash }) {
      return sessionResult(state.likes.has(visitorHash) ? { visitorHash } : null)
    },
    exists({ visitorHash }) {
      return Promise.resolve(state.likes.has(visitorHash))
    },
    async create([{ visitorHash }]) {
      if (state.likes.has(visitorHash)) throw duplicateKeyError()
      state.likes.add(visitorHash)
    },
    findOneAndDelete({ visitorHash }) {
      const existed = state.likes.delete(visitorHash)
      return sessionResult(existed ? { visitorHash } : null)
    },
    async deleteMany() {
      state.deletedLikes += state.likes.size
      state.likes.clear()
    },
  }

  const viewModel = {
    async findOneAndUpdate(filter, update) {
      const previous = state.views.get(filter.visitorHash)
      const cutoff = filter.$or[0].lastViewedAt.$lte
      if (previous && previous > cutoff) throw duplicateKeyError()
      state.views.set(filter.visitorHash, update.$set.lastViewedAt)
      return { visitorHash: filter.visitorHash }
    },
    async deleteMany() {
      state.deletedViews += state.views.size
      state.views.clear()
    },
  }

  if (state.post) attachSave(state.post)

  const service = createProfilePostService({
    postModel: PostModel,
    likeModel,
    viewModel,
    runInTransaction: (operation) => operation({ id: 'profile-post-test-session' }),
    now: () => new Date(state.now),
  })

  return { service, state }
}

function currentPost(overrides = {}) {
  return {
    _id: postId,
    key: 'home',
    text: 'Building useful things.',
    revision: 1,
    contentUpdatedAt: new Date('2026-10-14T12:00:00.000Z'),
    likeCount: 0,
    viewCount: 0,
    ...overrides,
  }
}

describe('profile post persistence constraints', () => {
  it('uses singleton and anonymous interaction uniqueness indexes', () => {
    assert.equal(hasIndex(ProfilePost, { key: 1 }, { unique: true }), true)
    assert.equal(
      hasIndex(ProfilePostLike, { post: 1, revision: 1, visitorHash: 1 }, { unique: true }),
      true,
    )
    assert.equal(
      hasIndex(ProfilePostView, { post: 1, revision: 1, visitorHash: 1 }, { unique: true }),
      true,
    )
    assert.equal(ProfilePostLike.schema.path('visitorHash').options.select, false)
    assert.equal(ProfilePostView.schema.path('visitorHash').options.select, false)
  })

  it('validates text and non-negative integer counters', async () => {
    await assert.rejects(
      new ProfilePost({
        key: 'home',
        text: '',
        revision: 1,
        contentUpdatedAt: new Date(),
      }).validate(),
    )
    await assert.rejects(
      new ProfilePost({
        key: 'home',
        text: 'Valid',
        revision: 1.5,
        contentUpdatedAt: new Date(),
        likeCount: -1,
      }).validate(),
    )
  })

  it('uses host-only HttpOnly visitor cookies and hashes their tokens', () => {
    const development = getVisitorCookie({ nodeEnv: 'development' })
    const production = getVisitorCookie({ nodeEnv: 'production' })

    assert.equal(development.name, 'cd_visitor')
    assert.equal(development.options.secure, false)
    assert.equal(production.name, '__Secure-cd_visitor')
    assert.equal(production.options.secure, true)
    assert.equal(production.options.httpOnly, true)
    assert.equal(production.options.sameSite, 'lax')
    assert.equal(production.options.path, '/api/v1')
    assert.equal('domain' in production.options, false)
    assert.match(hashVisitorToken('visitor-token'), /^[a-f0-9]{64}$/)
    assert.notEqual(hashVisitorToken('visitor-token'), 'visitor-token')
  })
})

describe('profile post business logic', () => {
  it('creates the singleton and treats identical replacement text as a no-op', async () => {
    const { service } = createHarness()

    const created = await service.replacePost({ text: 'First post' })
    const unchanged = await service.replacePost({ text: 'First post' })

    assert.equal(created.created, true)
    assert.equal(created.post.revision, 1)
    assert.equal(unchanged.created, false)
    assert.equal(unchanged.changed, false)
    assert.equal(unchanged.post.revision, 1)
  })

  it('starts a new revision and resets all interactions when text changes', async () => {
    const post = currentPost({ likeCount: 2, viewCount: 3 })
    const { service, state } = createHarness({ existingPost: post })
    state.likes.add('visitor-one')
    state.likes.add('visitor-two')
    state.views.set('visitor-one', new Date())

    const result = await service.replacePost({ text: 'A new post' })

    assert.equal(result.changed, true)
    assert.equal(result.post.revision, 2)
    assert.equal(result.post.likeCount, 0)
    assert.equal(result.post.viewCount, 0)
    assert.equal(state.likes.size, 0)
    assert.equal(state.views.size, 0)
    assert.equal(state.deletedLikes, 2)
    assert.equal(state.deletedViews, 1)
  })

  it('makes likes and unlikes idempotent', async () => {
    const { service, state } = createHarness({ existingPost: currentPost() })

    const firstLike = await service.like({ revision: 1, visitorHash: 'visitor-one' })
    const secondLike = await service.like({ revision: 1, visitorHash: 'visitor-one' })
    const firstUnlike = await service.unlike({ revision: 1, visitorHash: 'visitor-one' })
    const secondUnlike = await service.unlike({ revision: 1, visitorHash: 'visitor-one' })

    assert.equal(firstLike.changed, true)
    assert.equal(secondLike.changed, false)
    assert.equal(firstUnlike.changed, true)
    assert.equal(secondUnlike.changed, false)
    assert.equal(state.post.likeCount, 0)
  })

  it('deduplicates views for 24 hours and accepts them again after the window', async () => {
    const { service, state } = createHarness({ existingPost: currentPost() })

    const first = await service.recordView({ revision: 1, visitorHash: 'visitor-one' })
    state.now = new Date('2026-10-15T11:59:59.999Z')
    const duplicate = await service.recordView({ revision: 1, visitorHash: 'visitor-one' })
    state.now = new Date('2026-10-15T12:00:00.000Z')
    const nextDay = await service.recordView({ revision: 1, visitorHash: 'visitor-one' })

    assert.equal(first.recorded, true)
    assert.equal(duplicate.recorded, false)
    assert.equal(nextDay.recorded, true)
    assert.equal(state.post.viewCount, 2)
  })

  it('rejects interactions from a stale rendered revision', async () => {
    const { service, state } = createHarness({ existingPost: currentPost({ revision: 2 }) })

    await assert.rejects(service.like({ revision: 1, visitorHash: 'visitor-one' }), (error) => {
      assert.equal(error.status, 409)
      assert.equal(error.message, 'Profile post has changed')
      return true
    })
    assert.equal(state.post.likeCount, 0)
  })
})
