import { getEmailMode, isEmailEnabled, sendEmail } from './email'
import { renderEmailTemplate } from './emailTemplates'
import { renderSmsTemplate } from './sms/templates'
import { sendSms } from './sms/service'
import { isSmsEnabled } from '#shared/sms.ts'

export type NotifyChannel = 'email' | 'sms' | 'in_app'

export type NotifyTemplate =
  | 'WAITLIST_SLOT_AVAILABLE'
  | 'PASSWORD_RESET'
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_PAID'
  | 'CLUB_APPROVED'

/**
 * Channel notify — email gates on EMAIL_ENABLED / live SMTP; always fail-soft.
 * Booking/auth callers must not hard-fail when mail cannot send.
 */
export async function sendNotification(opts: {
  channel: NotifyChannel
  to: string
  template: NotifyTemplate
  data: Record<string, unknown>
  clubId?: string
}) {
  if (opts.channel === 'email') {
    try {
      if (!isEmailEnabled() || getEmailMode() !== 'live') {
        console.log('[notify:log]', 'email', opts.template, opts.to, opts.data)
        return { sent: false, logged: true }
      }
      const { subject, text, html } = renderEmailTemplate(opts.template, opts.data)
      const result = await sendEmail({ to: opts.to, subject, text, html })
      if (result.sent) return { sent: true }
      console.log('[notify:email:fallback]', opts.template, opts.to, opts.data)
      return { sent: false, logged: true }
    } catch (err) {
      console.error('[notify:email]', opts.template, opts.to, err)
      console.log('[notify:log]', 'email', opts.template, opts.to, opts.data)
      return { sent: false, logged: true }
    }
  }

  if (opts.channel === 'sms' && isSmsEnabled()) {
    try {
      const body = renderSmsTemplate(opts.template, opts.data)
      return await sendSms({ to: opts.to, body, clubId: opts.clubId, purpose: 'notify' })
    } catch (err) {
      console.error('[notify:sms]', opts.template, opts.to, err)
      console.log('[notify:log]', 'sms', opts.template, opts.to, opts.data)
      // Live failure: do not claim dry-run success — callers must treat as not delivered.
      return { sent: false, logged: false }
    }
  }

  console.log('[notify:log]', opts.channel, opts.template, opts.to, opts.data)
  return { sent: false, logged: true }
}

export async function createInAppNotification(opts: {
  userId: string
  type: string
  title: string
  body: string
  metadata?: Record<string, unknown>
}) {
  return prisma.notification.create({
    data: {
      userId: opts.userId,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      metadataJson: opts.metadata ? JSON.stringify(opts.metadata) : null,
    },
  })
}
