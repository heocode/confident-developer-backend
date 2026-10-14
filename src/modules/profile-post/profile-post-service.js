import mongoose from 'mongoose'
import createError from 'http-errors'

import { PROFILE_POST_KEY, ProfilePost } from './profile-post.js'
import { ProfilePostLike } from './profile-post-like.js'
import { ProfilePostView } from './profile-post-view.js'

const VIEW_DEDUPLICATION_MS = 24 * 60 * 60 * 1_000

async function runInMongoTransaction(operation) {
  const session = await mongoose.startSession()

  try {
    return await session.withTransaction(() => operation(session))
  } finally {
    await session.endSession()
  }
}

function useSession(query, session) {
  return session && typeof query?.session === 'function' ? query.session(session) : query
}

function isDuplicateKeyError(error) {
  return error?.code === 11_000
}

function assertRevision(post, revision) {
  if (!post) throw createError(404, 'Profile post not found')
  if (post.revision !== revision) throw createError(409, 'Profile post has changed')
}

export function createProfilePostService({
  postModel = ProfilePost,
  likeModel = ProfilePostLike,
  viewModel = ProfilePostView,
  runInTransaction = runInMongoTransaction,
  now = () => new Date(),
} = {}) {
  async function findCurrentPost(session) {
    return useSession(postModel.findOne({ key: PROFILE_POST_KEY }), session)
  }

  async function currentPostForRevision(revision, session) {
    const post = await findCurrentPost(session)
    assertRevision(post, revision)
    return post
  }

  async function recoverDuplicateInteraction(revision, field, state) {
    const post = await currentPostForRevision(revision)
    return { post, changed: false, [field]: state }
  }

  return {
    async getPost() {
      const post = await findCurrentPost()
      if (!post) throw createError(404, 'Profile post not found')
      return post
    },

    async replacePost({ text }) {
      return runInTransaction(async (session) => {
        let post = await findCurrentPost(session)
        const updatedAt = now()

        if (!post) {
          post = new postModel({
            key: PROFILE_POST_KEY,
            text,
            revision: 1,
            contentUpdatedAt: updatedAt,
            likeCount: 0,
            viewCount: 0,
          })
          await post.save({ session })
          return { post, created: true, changed: true }
        }

        if (post.text === text) return { post, created: false, changed: false }

        post.text = text
        post.revision += 1
        post.contentUpdatedAt = updatedAt
        post.likeCount = 0
        post.viewCount = 0
        await post.save({ session })
        await likeModel.deleteMany({ post: post._id }, { session })
        await viewModel.deleteMany({ post: post._id }, { session })

        return { post, created: false, changed: true }
      })
    },

    async getInteraction({ revision, visitorHash }) {
      const post = await currentPostForRevision(revision)
      if (!visitorHash) return { post, liked: false }

      const liked = Boolean(await likeModel.exists({ post: post._id, revision, visitorHash }))
      return { post, liked }
    },

    async like({ revision, visitorHash }) {
      try {
        return await runInTransaction(async (session) => {
          const post = await currentPostForRevision(revision, session)
          const existing = await useSession(
            likeModel.findOne({ post: post._id, revision, visitorHash }),
            session,
          )
          if (existing) return { post, changed: false, liked: true }

          await likeModel.create([{ post: post._id, revision, visitorHash }], { session })
          post.likeCount += 1
          await post.save({ session })
          return { post, changed: true, liked: true }
        })
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          return recoverDuplicateInteraction(revision, 'liked', true)
        }
        throw error
      }
    },

    async unlike({ revision, visitorHash }) {
      if (!visitorHash) {
        const post = await currentPostForRevision(revision)
        return { post, changed: false, liked: false }
      }

      return runInTransaction(async (session) => {
        const post = await currentPostForRevision(revision, session)
        const deleted = await useSession(
          likeModel.findOneAndDelete({ post: post._id, revision, visitorHash }),
          session,
        )
        if (!deleted) return { post, changed: false, liked: false }

        post.likeCount = Math.max(0, post.likeCount - 1)
        await post.save({ session })
        return { post, changed: true, liked: false }
      })
    },

    async recordView({ revision, visitorHash }) {
      const viewedAt = now()
      const cutoff = new Date(viewedAt.getTime() - VIEW_DEDUPLICATION_MS)

      try {
        return await runInTransaction(async (session) => {
          const post = await currentPostForRevision(revision, session)
          await viewModel.findOneAndUpdate(
            {
              post: post._id,
              revision,
              visitorHash,
              $or: [{ lastViewedAt: { $lte: cutoff } }, { lastViewedAt: { $exists: false } }],
            },
            {
              $set: { lastViewedAt: viewedAt },
              $setOnInsert: { post: post._id, revision, visitorHash },
            },
            { upsert: true, returnDocument: 'after', runValidators: true, session },
          )

          post.viewCount += 1
          await post.save({ session })
          return { post, changed: true, recorded: true }
        })
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          return recoverDuplicateInteraction(revision, 'recorded', false)
        }
        throw error
      }
    },
  }
}
