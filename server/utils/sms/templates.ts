import type { NotifyTemplate } from '../notify'

const TEMPLATE_BODIES: Record<NotifyTemplate | 'CAMPAIGN', (data: Record<string, unknown>) => string> = {
  PASSWORD_RESET: (data) => `Reset link: ${data.resetUrl || ''}`,
  BOOKING_CONFIRMED: (data) => `Booking confirmed for ${data.date || ''} at ${data.time || data.startTime || ''}`,
  BOOKING_CANCELLED: (data) => `Booking cancelled for ${data.date || ''} at ${data.time || data.startTime || ''}`,
  BOOKING_PAID: (data) => `Payment received for ${data.date || ''} at ${data.time || data.startTime || ''}`,
  CLUB_APPROVED: (data) => `Club approved: ${data.clubName || ''}`,
  WAITLIST_SLOT_AVAILABLE: (data) => `Slot available: ${data.date || ''} ${data.time || ''}`,
  CAMPAIGN: (data) => String(data.message || ''),
}

export function renderSmsTemplate(template: NotifyTemplate | 'CAMPAIGN', data: Record<string, unknown>) {
  const render = TEMPLATE_BODIES[template]
  return render ? render(data) : String(data.message || '')
}
