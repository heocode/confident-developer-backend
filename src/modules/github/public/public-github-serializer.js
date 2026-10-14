function serializeDate(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function serializePublicGitHubSummary(snapshot) {
  return {
    repositoryCount: snapshot.repositoryCount,
    languageCount: snapshot.languageCount,
    refreshedAt: serializeDate(snapshot.refreshedAt),
  }
}
