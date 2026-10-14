function serializeDate(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function sourceOf(post) {
  return typeof post?.toObject === 'function' ? post.toObject() : post
}

export function serializePublicProfilePost(post) {
  const source = sourceOf(post)

  return {
    id: (source._id ?? source.id).toString(),
    text: source.text,
    revision: source.revision,
    contentUpdatedAt: serializeDate(source.contentUpdatedAt),
    likes: source.likeCount,
    views: source.viewCount,
  }
}

export function serializeProfilePostInteraction(result) {
  return {
    revision: result.post.revision,
    likes: result.post.likeCount,
    liked: result.liked,
  }
}

export function serializeProfilePostView(result) {
  return {
    revision: result.post.revision,
    views: result.post.viewCount,
    recorded: result.recorded,
  }
}
