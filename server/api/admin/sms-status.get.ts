import { getSmsStatusSnapshot } from '#shared/sms.ts'

/** Safe SMS diagnostics — never returns API keys or message bodies. */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const snapshot = getSmsStatusSnapshot()
  const now = new Date()

  const [pendingScheduled, dueNow] = await Promise.all([
    prisma.campaign.count({
      where: { status: 'SCHEDULED', channel: 'SMS' },
    }),
    prisma.campaign.count({
      where: {
        status: 'SCHEDULED',
        channel: 'SMS',
        scheduledAt: { lte: now },
      },
    }),
  ])

  return {
    ok: true,
    ...snapshot,
    pendingScheduled,
    dueNow,
  }
})
