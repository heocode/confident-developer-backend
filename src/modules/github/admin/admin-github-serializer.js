function serializeDate(value) {
  if (value === undefined || value === null) return value
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function serializeAdminGitHubSnapshot(snapshot) {
  const source = typeof snapshot?.toObject === 'function' ? snapshot.toObject() : snapshot

  return {
    username: source.username,
    repositoryCount: source.repositoryCount,
    languageCount: source.languageCount,
    refreshedAt: serializeDate(source.refreshedAt),
    lastAttemptAt: serializeDate(source.lastAttemptAt),
    lastFailureAt: serializeDate(source.lastFailureAt),
    lastFailureCode: source.lastFailureCode,
  }
}
