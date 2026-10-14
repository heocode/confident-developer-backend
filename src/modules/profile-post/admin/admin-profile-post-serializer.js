function serializeDate(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function sourceOf(post) {
  return typeof post?.toObject === 'function' ? post.toObject() : post
}

export function serializeAdminProfilePost(post) {
  const source = sourceOf(post)

  return {
    id: (source._id ?? source.id).toString(),
    text: source.text,
    revision: source.revision,
    contentUpdatedAt: serializeDate(source.contentUpdatedAt),
    likes: source.likeCount,
    views: source.viewCount,
    createdAt: serializeDate(source.createdAt),
    updatedAt: serializeDate(source.updatedAt),
  }
}
