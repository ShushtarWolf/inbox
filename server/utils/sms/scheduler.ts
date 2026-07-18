import { resolveSmsProvider, recipientStatusForSmsResult } from '#shared/sms.ts'
import { sendBulkSms } from './service'

export type SchedulerResult = {
  processed: number
  failed: number
  pending: number
  provider: ReturnType<typeof resolveSmsProvider>
  note: string
  errors?: string[]
}

/** Build a clear result — never claims delivery that did not go through the SMS pipeline. */
export function formatSchedulerResult(opts: {
  processed: number
  failed: number
  pending: number
  provider: ReturnType<typeof resolveSmsProvider>
  errors?: string[]
}): SchedulerResult {
  const { processed, failed, pending, provider, errors } = opts
  let note: string
  if (processed > 0) {
    note = `Processed ${processed} due campaign(s) via ${provider}`
  } else if (pending > 0) {
    note = 'No due campaigns processed — SCHEDULED rows remain until due time or a successful send'
  } else {
    note = 'No scheduled SMS campaigns pending'
  }
  if (failed > 0) {
    note += ` (${failed} failed; left SCHEDULED — not marked sent)`
  }
  return {
    processed,
    failed,
    pending,
    provider,
    note,
    errors: errors?.length ? errors : undefined,
  }
}

/**
 * Minimal viable worker: send due SCHEDULED SMS campaigns through the real SMS pipeline.
 * Marks SENT only after send/log succeeds. Failures leave the campaign SCHEDULED (no fake sent).
 * Trigger via POST /api/admin/sms/process-scheduled (or call this from a cron later).
 */
export async function processScheduledCampaigns(opts?: { limit?: number }): Promise<SchedulerResult> {
  const limit = opts?.limit ?? 20
  const now = new Date()
  const due = await prisma.campaign.findMany({
    where: {
      status: 'SCHEDULED',
      channel: 'SMS',
      scheduledAt: { lte: now },
    },
    include: {
      recipients: { include: { contact: true } },
    },
    orderBy: { scheduledAt: 'asc' },
    take: limit,
  })

  let processed = 0
  let failed = 0
  const errors: string[] = []

  for (const campaign of due) {
    const consented = campaign.recipients
      .map((row) => row.contact)
      .filter((contact) => contact.consentSms && contact.mobile)

    try {
      const result = await sendBulkSms({
        recipients: consented.map((contact) => ({
          phone: contact.mobile,
          name: contact.name,
          contactId: contact.id,
        })),
        body: campaign.template,
        clubId: campaign.clubId,
        campaignName: campaign.name,
      })

      if (!result.sent && !result.logged) {
        failed++
        errors.push(`${campaign.id}: provider returned neither sent nor logged`)
        continue
      }

      const recipientStatus = recipientStatusForSmsResult(result)
      await prisma.$transaction([
        prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: 'SENT', sentAt: new Date() },
        }),
        ...campaign.recipients.map((row) =>
          prisma.campaignRecipient.update({
            where: { id: row.id },
            data: { status: recipientStatus },
          }),
        ),
      ])
      processed++
    } catch (err) {
      failed++
      const message = err instanceof Error ? err.message : 'send failed'
      errors.push(`${campaign.id}: ${message}`)
      console.error('[sms:scheduler] campaign failed — left SCHEDULED', campaign.id, err)
    }
  }

  const pending = await prisma.campaign.count({
    where: { status: 'SCHEDULED', channel: 'SMS' },
  })

  return formatSchedulerResult({
    processed,
    failed,
    pending,
    provider: resolveSmsProvider(),
    errors,
  })
}
