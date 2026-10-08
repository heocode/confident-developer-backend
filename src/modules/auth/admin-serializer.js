export function serializeAdmin(admin) {
  return {
    id: admin.id ?? admin._id.toString(),
    displayName: admin.displayName,
    email: admin.email,
  }
}
