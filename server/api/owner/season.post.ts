import { getPaymentsMode } from '#shared/payments.ts'
import { isOnlinePaymentsEnabled } from '#shared/bookingPayment.ts'
import { normalizeGuestNamePair } from '#shared/guestName.ts'
import { normalizeIranPhone } from '#shared/phone.ts'
import type { DayTimeRange } from '#shared/recurringSessions.ts'
import {
  expandSeasonRules,
  legacySeasonToRules,
  type SeasonSessionOccurrence,
  type SeasonSessionRule,
} from '#shared/seasonSessions.ts'
import {
  notifyBookingConfirmed,
  clubNotifyName,
  clubNotifyLocation,
  personNotifyName,
} from '../../utils/bookingNotify'
import { assertRecurringReserveEnabled } from '../../utils/recurringReserveGate'
import { assertDateNotInPast } from '../../utils/reservations'
import { resolveOwnerCourtIds } from '../../utils/resolveOwnerCourts'
import { createSeasonSessions } from '../../utils/seasonReserve'
import { assignBookingPayPin } from '../../utils/payPin'
import { payUrlForPin } from '../../utils/receipt'

function resolveGuestMobile(raw?: string | null) {
  if (!raw?.trim()) return ''
  return normalizeIranPhone(raw) || raw.trim()
}

function resolvePayment(body: {
  paymentMethod?: string
  paymentStatus?: string
}): { paymentMethod: 'CASH' | 'IPG'; paymentStatus: 'PAID' | 'PAY_AT_CLUB' } {
  const paid = body.paymentStatus === 'PAID'
  if (paid) return { paymentMethod: 'CASH', paymentStatus: 'PAID' }
  // Unpaid + online → IPG series pay link on primary booking.
  if (isOnlinePaymentsEnabled() && getPaymentsMode() !== 'pay_at_club') {
    return { paymentMethod: 'IPG', paymentStatus: 'PAY_AT_CLUB' }
  }
  return { paymentMethod: 'CASH', paymentStatus: 'PAY_AT_CLUB' }
}

function normalizeSessions(raw: unknown): SeasonSessionOccurrence[] {
  if (!Array.isArray(raw)) return []
  const out: SeasonSessionOccurrence[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const s = row as Record<string, unknown>
    const date = String(s.date || '').trim()
    const startTime = String(s.startTime || '').trim().slice(0, 5)
    const courtId = String(s.courtId || '').trim()
    if (!date || !startTime || !courtId) continue
    out.push({ date, startTime, courtId })
  }
  return out
}

function normalizeRules(raw: unknown): SeasonSessionRule[] {
  if (!Array.isArray(raw)) return []
  const out: SeasonSessionRule[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const s = row as Record<string, unknown>
    const weekday = String(s.weekday || '').trim()
    const startTime = String(s.startTime || '').trim().slice(0, 5)
    const endTime = String(s.endTime || '').trim().slice(0, 5)
    const courtId = String(s.courtId || '').trim()
    if (!weekday || !startTime || !endTime || !courtId) continue
    out.push({ weekday, startTime, endTime, courtId })
  }
  return out
}

export default defineEventHandler(async (event) => {
  assertRecurringReserveEnabled(event)
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    guestName?: string
    guestFamily?: string
    guestMobile?: string
    days?: string[]
    times?: string[]
    dayTimes?: Record<string, DayTimeRange>
    startDate?: string
    finishDate?: string
    comments?: string
    slotId?: string
    courtIds?: string[]
    /** New: per-weekday court+time rules. */
    rules?: SeasonSessionRule[]
    /** New: explicit occurrence list (after client edit). */
    sessions?: SeasonSessionOccurrence[]
    paymentMethod?: string
    paymentStatus?: string
    /** Ignored — conflicts are always soft-skipped. Kept for older clients. */
    acceptSkips?: boolean
  }>(event)

  if (!body.startDate || !body.finishDate) {
    throw createError({ statusCode: 400, statusMessage: 'Start and finish dates are required' })
  }
  if (body.finishDate < body.startDate) {
    throw createError({ statusCode: 400, statusMessage: 'Finish date must be on or after start date' })
  }
  assertDateNotInPast(body.startDate)

  let sessions = normalizeSessions(body.sessions)
  if (!sessions.length) {
    let rules = normalizeRules(body.rules)
    if (!rules.length) {
      const courtIds = await resolveOwnerCourtIds(club.id, body)
      rules = legacySeasonToRules({
        days: body.days || [],
        dayTimes: body.dayTimes,
        times: body.times,
        courtIds,
      })
    }
    if (!rules.length) {
      throw createError({ statusCode: 400, statusMessage: 'schedule is required' })
    }
    sessions = expandSeasonRules({
      startDate: body.startDate,
      finishDate: body.finishDate,
      rules,
    })
  }

  if (!sessions.length) {
    throw createError({ statusCode: 400, statusMessage: 'schedule is required' })
  }

  const guest = normalizeGuestNamePair(body.guestName, body.guestFamily)
  const guestMobile = resolveGuestMobile(body.guestMobile)
  const { paymentMethod, paymentStatus } = resolvePayment(body)

  const result = await createSeasonSessions({
    clubId: club.id,
    sessions,
    guestName: guest.guestName,
    guestFamily: guest.guestFamily,
    guestMobile,
    comments: body.comments,
    paymentMethod,
    paymentStatus,
  })

  // Cash unpaid still gets a pin when online payments are on (series link).
  let payPin = result.payPin
  let payUrl = result.payUrl
  if (!payPin && paymentStatus !== 'PAID' && isOnlinePaymentsEnabled() && result.primaryBookingId) {
    payPin = await assignBookingPayPin(result.primaryBookingId)
    payUrl = payUrlForPin(payPin)
  }

  if (guestMobile && result.slotsCreated > 0) {
    const first = result.willCreate[0]
    const last = result.willCreate[result.willCreate.length - 1]
    await notifyBookingConfirmed({
      phone: guestMobile,
      kind: 'court',
      clubName: clubNotifyName(club),
      clubId: club.id,
      bookingId: result.primaryBookingId || result.seasonBookingId,
      date: first?.date || body.startDate,
      finishDate: last?.date || body.finishDate,
      startTime: first?.startTime || '',
      endTime: first?.endTime || '',
      sessionCount: result.slotsCreated,
      paymentPaid: paymentStatus === 'PAID',
      guestName: personNotifyName(guest.guestName, guest.guestFamily),
      payPin: paymentStatus === 'PAID' ? undefined : payPin,
      payUrl: paymentStatus === 'PAID' ? undefined : payUrl,
      ...clubNotifyLocation(club),
    })
  }

  return {
    id: result.seasonBookingId,
    slotsCreated: result.slotsCreated,
    slotsSkipped: result.slotsSkipped,
    conflicts: result.conflicts,
    willCreate: result.willCreate,
    totalAmount: result.totalAmount,
    primaryBookingId: result.primaryBookingId,
    payPin,
    payUrl,
  }
})
