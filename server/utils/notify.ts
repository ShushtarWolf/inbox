import { sendEmail } from './email'
import { renderEmailTemplate } from './emailTemplates'

export type NotifyChannel = 'email' | 'sms' | 'in_app'

export type NotifyTemplate =
  | 'WAITLIST_SLOT_AVAILABLE'
  | 'PASSWORD_RESET'
  | 'BOOKING_CONFIRMED'
  | 'CLUB_APPROVED'

export async function sendNotification(opts: {
  channel: NotifyChannel
  to: string
  template: NotifyTemplate
  data: Record<string, unknown>
}) {
  const emailEnabled = process.env.EMAIL_ENABLED === 'true'
  const smsEnabled = process.env.SMS_ENABLED === 'true'

  if (opts.channel === 'email' && emailEnabled) {
    const { subject, text, html } = renderEmailTemplate(opts.template, opts.data)
    const result = await sendEmail({ to: opts.to, subject, text, html })
    if (result.sent) return { sent: true }
    console.log('[notify:email:fallback]', opts.template, opts.to, opts.data)
    return { sent: false, logged: true }
  }
  if (opts.channel === 'sms' && smsEnabled) {
    console.log('[notify:sms]', opts.template, opts.to, opts.data)
    return { sent: true }
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
