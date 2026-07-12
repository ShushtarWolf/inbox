import type { SlotDisplayStatus } from '@prisma/client'
import { todayDateString } from '#shared/localDate.ts'

export function slotStatusLabel(status: SlotDisplayStatus, locale = 'fa') {
  const fa: Record<SlotDisplayStatus, string> = {
    FREE: 'آزاد',
    RESERVED: 'رزرو',
    PUBLIC: 'رزرو عمومی',
    TEAM: 'تیم',
    PENDING: 'در انتظار',
    CANCELLED: 'کنسل',
    CLOSED: 'بسته',
  }
  const en: Record<SlotDisplayStatus, string> = {
    FREE: 'Free',
    RESERVED: 'Reserved',
    PUBLIC: 'Public',
    TEAM: 'Team',
    PENDING: 'Pending',
    CANCELLED: 'Cancelled',
    CLOSED: 'Closed',
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
        price: court.price,
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
}
