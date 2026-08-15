export const TICKET_BODY_MIN = 10
export const TICKET_BODY_MAX = 4000
export const TICKET_REPLY_MAX = 4000

export type SupportTicketSource = 'CONTACT' | 'ATHLETE' | 'OWNER'
export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'

export function normalizeTicketBody(raw: unknown, max = TICKET_BODY_MAX): string | null {
  if (typeof raw !== 'string') return null
  const body = raw.trim()
  if (body.length < TICKET_BODY_MIN || body.length > max) return null
  return body
}

export function normalizeOptionalLine(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null
  return value.slice(0, max)
}

export function isPlausibleEmail(value: string): boolean {
  return value.includes('@') && value.includes('.') && value.length <= 160
}
