import type { SmsProvider } from '#shared/sms.ts'
import { registerSmsProvider } from '../registry'

export function logSmsProvider(): SmsProvider {
  const provider: SmsProvider = {
    name: 'log',
    async send(opts) {
      console.log('[sms:log]', opts.to, opts.body.slice(0, 80))
      if (opts.clubId) {
        await prisma.smsLog.create({
          data: {
            clubId: opts.clubId,
            message: opts.body,
            recipient: opts.to,
          },
        })
      }
      return { sent: false, logged: true, providerRef: `log-${Date.now()}` }
    },
    async sendBulk(opts) {
      const consented = opts.recipients
      console.log('[sms:log:bulk]', consented.length, opts.body.slice(0, 80))
      if (opts.clubId) {
        await prisma.smsLog.create({
          data: {
            clubId: opts.clubId,
            message: opts.body,
            recipient: `${consented.length} contacts`,
            segmentName: opts.segmentName,
            campaignName: opts.campaignName,
          },
        })
      }
      return { sent: false, logged: true, providerRef: `log-bulk-${Date.now()}` }
    },
  }
  registerSmsProvider(provider)
  return provider
}
