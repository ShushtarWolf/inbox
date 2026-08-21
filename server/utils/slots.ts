import type { SlotDisplayStatus } from '@prisma/client'
import { todayDateString } from '#shared/localDate.ts'
import { computeListedSlotPrice } from '#shared/courtPricing.ts'

export function slotStatusLabel(status: SlotDisplayStatus, locale = 'fa') {
  const fa: Record<SlotDisplayStatus, string> = {
    FREE: 'آزاد',
    RESERVED: 'رزرو',
    PUBLIC: 'رزرو عمومی',
    TEAM: 'تیم',
    PENDING: 'در انتظار',
    CANCELLED: 'کنسل',
    CLOSED: 'بسته',
    BLOCKED: 'مسدود',
  }
  const en: Record<SlotDisplayStatus, string> = {
    FREE: 'Free',
    RESERVED: 'Reserved',
    PUBLIC: 'Public',
    TEAM: 'Team',
    PENDING: 'Pending',
    CANCELLED: 'Cancelled',
    CLOSED: 'Closed',
    BLOCKED: 'Blocked',
  }
  return locale === 'en' ? en[status] : fa[status]
}

export function todayDateStr() {
  return todayDateString()
}

export function formatHour(h: number) {
  return `${String(h).padStart(2, '0')}:00`
}

export function addMinutes(time: string, minutes: number): string {
  const h = Number.parseInt(time.slice(0, 2), 10)
  const m = Number.parseInt(time.slice(3, 5) || '0', 10)
  const total = h * 60 + m + minutes
  const nh = Math.floor(total / 60)
  const nm = total % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

export function hourEnd(h: number) {
  return `${String(h + 1).padStart(2, '0')}:00`
}

export type CourtSlotInput = {
  courtId: string
  price: number
  pricingJson?: string | null
  openHour: number
  closeHour: number
  sessionDurationMinutes?: number
}

/** Pure helper — compute slot rows missing from existing keys. */
export function computeMissingSlots(
  courts: CourtSlotInput[],
  date: string,
  existingKeys: Set<string>,
) {
  const missing: Array<{
    courtId: string
    date: string
    startTime: string
    endTime: string
    price: number
    displayStatus: 'FREE'
  }> = []

  for (const court of courts) {
    const duration = court.sessionDurationMinutes ?? 60
    const openTotal = court.openHour * 60
    const closeTotal = court.closeHour * 60
    for (let m = openTotal; m + duration <= closeTotal; m += duration) {
      const h = Math.floor(m / 60)
      const min = m % 60
      const startTime = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
      const endTime = addMinutes(startTime, duration)
      const key = `${court.courtId}:${date}:${startTime}`
      if (existingKeys.has(key)) continue
      missing.push({
        courtId: court.courtId,
        date,
        startTime,
        endTime,
        price: computeListedSlotPrice(court.price, startTime, court.pricingJson),
        displayStatus: 'FREE',
      })
    }
  }
  return missing
}

export async function ensureSlotsForDate(clubId: string, date: string) {
  const courts = await prisma.court.findMany({
    where: { clubId },
    include: { club: true },
  })
  if (!courts.length) return

  const courtIds = courts.map((court) => court.id)
  const existing = await prisma.slot.findMany({
    where: { courtId: { in: courtIds }, date },
    select: { courtId: true, startTime: true },
  })
  const existingKeys = new Set(existing.map((slot) => `${slot.courtId}:${date}:${slot.startTime}`))

  const missing = computeMissingSlots(
    courts.map((court) => ({
      courtId: court.id,
      price: court.price,
      pricingJson: court.pricingJson,
      openHour: court.openHour ?? court.club.openHour,
      closeHour: court.closeHour ?? court.club.closeHour,
      sessionDurationMinutes: court.club.defaultSessionDurationMinutes,
    })),
    date,
    existingKeys,
  )

  if (missing.length) {
    await prisma.slot.createMany({ data: missing, skipDuplicates: true })
  }

  // Heal FREE slot prices for this date when court base/bands changed after slots were created.
  await repriceFreeSlotsForCourts(
    courts.map((court) => ({
      id: court.id,
      price: court.price,
      pricingJson: court.pricingJson,
    })),
    { date },
  )
}

export type CourtPriceInput = {
  id: string
  price: number
  pricingJson?: string | null
}

/** Pure: which FREE slots need a new listed price after court pricing changes. */
export function listedSlotPriceUpdates(
  slots: Array<{ id: string; startTime: string; price: number }>,
  court: { price: number; pricingJson?: string | null },
): Array<{ id: string; price: number }> {
  const updates: Array<{ id: string; price: number }> = []
  for (const slot of slots) {
    const next = computeListedSlotPrice(court.price, slot.startTime, court.pricingJson)
    if (next !== slot.price) updates.push({ id: slot.id, price: next })
  }
  return updates
}

/**
 * Reprice FREE (bookable) slots to match current court listing.
 * Does not touch RESERVED/paid rows — those keep the amount sold.
 */
export async function repriceFreeSlotsForCourts(
  courts: CourtPriceInput[],
  opts?: { date?: string; courtId?: string },
) {
  if (!courts.length) return { updated: 0 }
  const courtById = new Map(courts.map((court) => [court.id, court]))
  const courtIds = opts?.courtId ? [opts.courtId] : courts.map((court) => court.id)
  const freeSlots = await prisma.slot.findMany({
    where: {
      courtId: { in: courtIds },
      displayStatus: 'FREE',
      ...(opts?.date ? { date: opts.date } : {}),
    },
    select: { id: true, courtId: true, startTime: true, price: true },
  })

  let updated = 0
  for (const slot of freeSlots) {
    const court = courtById.get(slot.courtId)
    if (!court) continue
    const next = computeListedSlotPrice(court.price, slot.startTime, court.pricingJson)
    if (next === slot.price) continue
    await prisma.slot.update({ where: { id: slot.id }, data: { price: next } })
    updated += 1
  }
  return { updated }
}
