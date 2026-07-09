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

export function hourEnd(h: number) {
  return `${String(h + 1).padStart(2, '0')}:00`
}

export async function ensureSlotsForDate(clubId: string, date: string) {
  const courts = await prisma.court.findMany({
    where: { clubId },
    include: { club: true },
  })
  for (const court of courts) {
    const { openHour, closeHour } = court.club
    for (let h = openHour; h < closeHour; h++) {
      const startTime = formatHour(h)
      const existing = await prisma.slot.findFirst({
        where: { courtId: court.id, date, startTime },
      })
      if (!existing) {
        await prisma.slot.create({
          data: {
            courtId: court.id,
            date,
            startTime,
            endTime: hourEnd(h),
            price: court.price,
            displayStatus: 'FREE',
          },
        })
      }
    }
  }
}
