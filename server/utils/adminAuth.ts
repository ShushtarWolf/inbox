import type { H3Event } from 'h3'

export function requireAdminSecret(event: H3Event) {
  const secret = process.env.ADMIN_PROVISION_SECRET
  if (!secret) {
    throw createError({ statusCode: 503, statusMessage: 'Admin provisioning not configured' })
  }
  const provided = getHeader(event, 'x-admin-secret')
  if (!provided || provided !== secret) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
}
