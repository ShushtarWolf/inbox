export type NotifyChannel = 'email' | 'sms' | 'in_app'

export type NotifyTemplate =
  | 'WAITLIST_SLOT_AVAILABLE'
  | 'PASSWORD_RESET'
  | 'BOOKING_CONFIRMED'

export async function sendNotification(opts: {
  channel: NotifyChannel
  to: string
  template: NotifyTemplate
  data: Record<string, unknown>
}) {
  const emailEnabled = process.env.EMAIL_ENABLED === 'true'
  const smsEnabled = process.env.SMS_ENABLED === 'true'

  if (opts.channel === 'email' && emailEnabled) {
    console.log('[notify:email]', opts.template, opts.to, opts.data)
    return { sent: true }
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
