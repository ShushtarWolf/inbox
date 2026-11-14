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
  notifyBookingPaid,
  notifyOwnerBookingPaid,
  clubNotifyName,
  clubNotifyLocation,
  courtNotifyName,
  ownerNotifyPhone,
  personNotifyName,
} from '../../utils/bookingNotify'
import { assertRecurringReserveEnabled } from '../../utils/recurringReserveGate'
import { resolveOwnerCourtIds } from '../../utils/resolveOwnerCourts'
import { applySeasonEdit } from '../../utils/seasonEdit'
import { createSeasonSessions } from '../../utils/seasonReserve'
import { assignBookingPayPin } from '../../utils/payPin'
import { prisma } from '../../utils/prisma'
import { payUrlForPin } from '../../utils/receipt'

function maskPhone(phone: string) {
  return phone.length > 6 ? `${phone.slice(0, 4)}***${phone.slice(-2)}` : '***'
}

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
    discountCode?: string
    deskDiscountPercent?: number
    complimentary?: boolean
    /** Edit an existing season in place: diff hours, keep unchanged bookings, add/cancel only the changes. */
    replaceSeasonBookingId?: string
  }>(event)

  if (!body.startDate || !body.finishDate) {
    throw createError({ statusCode: 400, statusMessage: 'Start and finish dates are required' })
  }
  if (body.finishDate < body.startDate) {
    throw createError({ statusCode: 400, statusMessage: 'Finish date must be on or after start date' })
  }
  const replaceSeasonBookingId = String(body.replaceSeasonBookingId || '').trim()
  // Edit that only cancels future hours (end moved before the next session): the client sends an
  // explicit empty list. Never re-expand rules for it — the diff then removes future hours only.
  const removalOnlyEdit = Boolean(replaceSeasonBookingId) && Array.isArray(body.sessions) && body.sessions.length === 0
  let sessions = normalizeSessions(body.sessions)
  if (!sessions.length && !removalOnlyEdit) {
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

  if (!sessions.length && !removalOnlyEdit) {
    throw createError({ statusCode: 400, statusMessage: 'schedule is required' })
  }

  const guest = normalizeGuestNamePair(body.guestName, body.guestFamily)
  const guestMobile = resolveGuestMobile(body.guestMobile)
  const { paymentMethod, paymentStatus } = resolvePayment(body)

  if (replaceSeasonBookingId) {
    // Diff-based edit: unchanged hours untouched, added hours created, removed hours cancelled
    // with normal refund rules — all in one transaction (see server/utils/seasonEdit.ts).
    const edit = await applySeasonEdit({
      clubId: club.id,
      seasonBookingId: replaceSeasonBookingId,
      sessions,
      guestName: guest.guestName,
      guestFamily: guest.guestFamily,
      guestMobile,
      comments: body.comments ?? null,
      startDate: body.startDate,
      finishDate: body.finishDate,
      paymentMethod,
      paymentStatus,
    })
    if (edit.added > 0) {
      const courtIds = [...new Set(edit.addedUnits.map((s) => s.courtId))]
      const courts = await prisma.court.findMany({
        where: { id: { in: courtIds }, clubId: club.id },
        select: { id: true, nameFa: true, nameEn: true },
      })
      const courtById = new Map(courts.map((c) => [c.id, c]))
      const first = edit.addedUnits[0]
      const last = edit.addedUnits[edit.addedUnits.length - 1]
      await notifyBookingConfirmed({
        phone: guestMobile || null,
        kind: 'court' as const,
        clubName: clubNotifyName(club),
        clubId: club.id,
        bookingId: edit.addedBookingIds[0] || replaceSeasonBookingId,
        date: first?.date || body.startDate,
        finishDate: last?.date || body.finishDate,
        startTime: first?.startTime || '',
        endTime: first?.endTime || '',
        sessionCount: edit.added,
        sessions: edit.addedUnits.map((s) => ({
          courtName: courtNotifyName(courtById.get(s.courtId) || { nameFa: s.courtId }),
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
        paymentPaid: paymentStatus === 'PAID',
        guestName: personNotifyName(guest.guestName, guest.guestFamily),
        skipGuest: true,
        ...clubNotifyLocation(club),
      })
    }
    return {
      id: replaceSeasonBookingId,
      edit: {
        unchanged: edit.unchanged,
        added: edit.added,
        removed: edit.removed,
        keptPast: edit.keptPast,
        addedRanges: edit.addedRanges,
        removedRanges: edit.removedRanges,
        refundTotal: edit.refundTotal,
        cashReturnTotal: edit.cashReturnTotal,
      },
      slotsCreated: edit.added,
      slotsSkipped: 0,
      conflicts: [],
      willCreate: edit.addedUnits,
      totalAmount: edit.addedAmount,
      primaryBookingId: null,
      smsSent: false,
    }
  }

  const result = await createSeasonSessions({
    clubId: club.id,
    sessions,
    guestName: guest.guestName,
    guestFamily: guest.guestFamily,
    guestMobile,
    comments: body.comments,
    paymentMethod,
    paymentStatus,
    discountCode: body.discountCode,
    deskDiscountPercent: body.deskDiscountPercent,
    complimentary: body.complimentary === true,
  })

  // Cash unpaid still gets a pin when online payments are on (series link).
  let payPin = result.payPin
  let payUrl = result.payUrl
  if (!payPin && paymentStatus !== 'PAID' && isOnlinePaymentsEnabled() && result.primaryBookingId) {
    payPin = await assignBookingPayPin(result.primaryBookingId)
    payUrl = payUrlForPin(payPin)
  }

  let smsSent = false
  if (result.slotsCreated > 0) {
    const first = result.willCreate[0]
    const last = result.willCreate[result.willCreate.length - 1]
    const courtIds = [...new Set(result.willCreate.map((s) => s.courtId))]
    const courts = await prisma.court.findMany({
      where: { id: { in: courtIds }, clubId: club.id },
      select: { id: true, nameFa: true, nameEn: true },
    })
    const courtById = new Map(courts.map((c) => [c.id, c]))
    const guestName = personNotifyName(guest.guestName, guest.guestFamily)
    const notifyOpts = {
      phone: guestMobile || null,
      kind: 'court' as const,
      clubName: clubNotifyName(club),
      clubId: club.id,
      bookingId: result.primaryBookingId || result.seasonBookingId,
      date: first?.date || body.startDate,
      finishDate: last?.date || body.finishDate,
      startTime: first?.startTime || '',
      endTime: first?.endTime || '',
      sessionCount: result.slotsCreated,
      sessions: result.willCreate.map((s) => ({
        courtName: courtNotifyName(courtById.get(s.courtId) || { nameFa: s.courtId }),
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
      paymentPaid: paymentStatus === 'PAID',
      guestName,
      payPin: paymentStatus === 'PAID' ? undefined : payPin,
      payUrl: paymentStatus === 'PAID' ? undefined : payUrl,
      // New season from the owner wizard: the athlete mobile the owner typed gets the
      // confirmation (paid) or pay-link (unpaid) SMS — the wizard promises this
      // (owner.seasonPage.phoneSmsHint / successCashBody). Club side is notified as before.
      skipGuest: !guestMobile,
      ...clubNotifyLocation(club),
    }
    await notifyBookingConfirmed(notifyOpts)
    if (paymentStatus === 'PAID') {
      smsSent = (await notifyBookingPaid(notifyOpts)).smsSent
      if (guestMobile && !smsSent) {
        console.warn('[owner:season:sms] athlete BOOKING_PAID not sent', maskPhone(guestMobile), club.id, notifyOpts.bookingId)
      }
      await notifyOwnerBookingPaid({
        ownerPhone: ownerNotifyPhone(club),
        clubName: clubNotifyName(club),
        clubId: club.id,
        bookingId: notifyOpts.bookingId,
        date: notifyOpts.date,
        startTime: notifyOpts.startTime,
        endTime: notifyOpts.endTime,
        sessions: notifyOpts.sessions,
        guestName,
        guestPhone: guestMobile || null,
        amountPaid: result.totalAmount,
      })
    }
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
    smsSent,
  }
})
