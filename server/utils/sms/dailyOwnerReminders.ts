import { normalizeIranPhone } from '#shared/phone.ts'
import { toPersianDigits } from '#shared/jalali.ts'
import { resolveSmsProvider } from '#shared/sms.ts'
import {
  clubNotifyName,
  courtNotifyName,
  ownerNotifyPhone,
  personNotifyName,
} from '../bookingNotify'
import { todayDateStr } from '../slots'
import { sendSms } from './service'
import { chunkSmsBodyForToken10 } from './providers/kavenegar'
import { renderSmsTemplate } from './templates'

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

export function reservationGuestLabel(booking: {
  guestName?: string | null
  guestFamily?: string | null
  guestMobile?: string | null
  user?: { name?: string | null; phone?: string | null } | null
}) {
  const name =
    personNotifyName(booking.guestName, booking.guestFamily)
    || personNotifyName(booking.user?.name)
  if (name) return name
  const phone = normalizeIranPhone(booking.user?.phone || booking.guestMobile)
  if (phone) return `مهمان (${toPersianDigits(phone)})`
  return 'مهمان'
}

/**
 * Soft-fail daily digest to club owners for courts booked on `date` (Tehran YYYY-MM-DD).
 * Only clubs with ≥1 non-cancelled reservation receive SMS (empty days = no send).
 * Idempotent via SmsLog.campaignName.
 */
export async function processDailyOwnerReservationReminders(opts?: {
  date?: string
}): Promise<DailyOwnerReminderResult> {
  const date = opts?.date || todayDateStr()
  const provider = resolveSmsProvider()
  const campaignName = dailyOwnerReminderCampaignName(date)

  const bookings = await prisma.booking.findMany({
    where: {
      status: { not: 'CANCELLED' },
      slot: {
        date,
        court: { club: { status: 'ACTIVE' } },
      },
    },
    include: {
      user: { select: { name: true, phone: true } },
      slot: {
        include: {
          court: {
            include: {
              club: { include: { owner: { select: { phone: true } } } },
            },
          },
        },
      },
    },
    orderBy: [{ slot: { startTime: 'asc' } }, { slot: { courtId: 'asc' } }],
  })

  const byClub = new Map<
    string,
    {
      club: (typeof bookings)[number]['slot']['court']['club']
      lines: Array<{ court: string; start: string; end: string; guest: string }>
    }
  >()

  for (const booking of bookings) {
    const club = booking.slot.court.club
    let group = byClub.get(club.id)
    if (!group) {
      group = { club, lines: [] }
      byClub.set(club.id, group)
    }
    group.lines.push({
      court: courtNotifyName(booking.slot.court),
      start: booking.slot.startTime,
      end: booking.slot.endTime,
      guest: reservationGuestLabel(booking),
    })
  }

  let sent = 0
  let skippedNoPhone = 0
  let skippedAlreadySent = 0
  let failed = 0
  const errors: string[] = []
  const clubsWithReservations = byClub.size

  for (const { club, lines } of byClub.values()) {
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

    const body = renderSmsTemplate('OWNER_DAILY_RESERVATIONS', {
      clubName: clubNotifyName(club),
      date,
      lines,
      count: lines.length,
    })

    // Log mode keeps the full multi-line body; live Verify Lookup token10 needs chunks.
    const parts = provider === 'live' ? chunkSmsBodyForToken10(body) : [body]

    try {
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!
        const result = await sendSms({
          to: phone,
          body: part,
          clubId: club.id,
          purpose: 'notify',
          template: i === 0 ? campaignName : `${campaignName}:p${i + 1}`,
        })
        if (!result.sent && !result.logged) {
          throw new Error('provider returned neither sent nor logged')
        }
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
