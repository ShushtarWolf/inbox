export function requireClubOwner(membership: { role: string }) {
  if (membership.role !== 'OWNER') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
}
