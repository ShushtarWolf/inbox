import { timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

function secretsEqual(provided: string, expected: string) {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

export function requireAdminSecret(event: H3Event) {
  const secret = process.env.ADMIN_PROVISION_SECRET
  if (!secret) {
    throw createError({ statusCode: 503, statusMessage: 'Admin provisioning not configured' })
  }
  const provided = getHeader(event, 'x-admin-secret')
  if (!provided || !secretsEqual(provided, secret)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
}
