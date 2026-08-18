import { resolveSmsProvider } from '#shared/sms.ts'
import { ownerNotifyPhone } from '../bookingNotify'
import { todayDateStr } from '../slots'
import { sendSms } from './service'
import { ownerDailyReservationsCalendarUrl, renderSmsTemplate } from './templates'

export type DailyOwnerReminderResult = {
  date: string
  provider: ReturnType<typeof resolveSmsProvider>
  clubsWithReservations: number
  sent: number
  skippedNoPhone: number
  skippedAlreadySent: number
  failed: number
  note: string
  errors?: string[]
}

export function dailyOwnerReminderCampaignName(date: string) {
  return `OWNER_DAILY_RESERVATIONS:${date}`
}

/**
 * Soft-fail daily ping to club owners when they have courts booked on `date` (Tehran YYYY-MM-DD).
 * One short SMS per club (calendar URL; no court/time/guest list). Empty days = no send.
 * Idempotent via SmsLog.campaignName.
 *
 * Live send uses the same Kavenegar Verify Lookup %token10% path as BOOKING_CONFIRMED.
 * token10 cannot carry a tappable URL (punctuation stripped); do not switch to sms/send
 * (prod service line returns 412). Full URL is in the body for log mode + SmsLog.
 */
export async function processDailyOwnerReservationReminders(opts?: {
  date?: string
}): Promise<DailyOwnerReminderResult> {
  const date = opts?.date || todayDateStr()
  const provider = resolveSmsProvider()
  const campaignName = dailyOwnerReminderCampaignName(date)
  const calendarUrl = ownerDailyReservationsCalendarUrl()

  const bookings = await prisma.booking.findMany({
    where: {
      status: { not: 'CANCELLED' },
      slot: {
        date,
        court: { club: { status: 'ACTIVE' } },
      },
    },
    select: {
      slot: {
        select: {
          court: {
            select: {
              club: {
                select: {
                  id: true,
                  phone: true,
                  owner: { select: { phone: true } },
                },
              },
            },
          },
        },
      },
    },
  })

  const byClub = new Map<string, (typeof bookings)[number]['slot']['court']['club']>()
  for (const booking of bookings) {
    const club = booking.slot.court.club
    if (!byClub.has(club.id)) byClub.set(club.id, club)
  }

  let sent = 0
  let skippedNoPhone = 0
  let skippedAlreadySent = 0
  let failed = 0
  const errors: string[] = []
  const clubsWithReservations = byClub.size

  for (const club of byClub.values()) {
    const phone = ownerNotifyPhone(club)
    if (!phone) {
      skippedNoPhone++
      continue
    }

    const already = await prisma.smsLog.findFirst({
      where: { clubId: club.id, campaignName },
      select: { id: true },
    })
    if (already) {
      skippedAlreadySent++
      continue
    }

    const body = renderSmsTemplate('OWNER_DAILY_RESERVATIONS', { calendarUrl })

    try {
      const result = await sendSms({
        to: phone,
        body,
        clubId: club.id,
        purpose: 'notify',
        template: campaignName,
      })
      if (!result.sent && !result.logged) {
        throw new Error('provider returned neither sent nor logged')
      }
      console.log('[sms:dailyOwnerReminders]', provider, club.id, phone, body)
      sent++
    } catch (err) {
      failed++
      const message = err instanceof Error ? err.message : 'send failed'
      errors.push(`${club.id}: ${message}`)
      console.error('[sms:dailyOwnerReminders]', club.id, err)
    }
  }

  let note: string
  if (sent > 0) {
    note = `Sent daily owner reservation reminders for ${date} via ${provider} (${sent} club(s))`
  } else if (clubsWithReservations === 0) {
    note = `No clubs with reservations on ${date} — nothing to send`
  } else {
    note = `No daily owner reminders sent for ${date} (${skippedAlreadySent} already sent, ${skippedNoPhone} no phone, ${failed} failed)`
  }

  return {
    date,
    provider,
    clubsWithReservations,
    sent,
    skippedNoPhone,
    skippedAlreadySent,
    failed,
    note,
    errors: errors.length ? errors : undefined,
  }
}
