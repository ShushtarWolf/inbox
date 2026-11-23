import type { PrismaClient } from '@prisma/client'
import {
  groupOrphanBookingsByPhone,
  pickDeskGuestNameForBackfill,
  type OrphanGuestBooking,
} from '#shared/backfillManualBookingAthletes.ts'
import { maskPhone } from './bookingNotify'
import { ensureAthleteUserByPhone, findExistingUserByPhoneVariants } from './phoneAuth'

export type BackfillManualAthletesResult = {
  dryRun: boolean
  orphanBookingCount: number
  distinctPhoneCount: number
  invalidPhoneSkipped: number
  wouldCreateUsers: number
  wouldLinkUsers: number
  wouldLinkBookings: number
  usersCreated: number
  usersReused: number
  bookingsLinked: number
  phones: Array<{
    phoneMasked: string
    bookingCount: number
    action: 'create' | 'link'
    guestName?: string
  }>
}

async function loadOrphanGuestBookings(prisma: PrismaClient): Promise<{
  rows: OrphanGuestBooking[]
  invalidPhoneSkipped: number
}> {
  const rows: OrphanGuestBooking[] = []
  let invalidPhoneSkipped = 0
  const batch = 500
  let cursor: string | undefined

  for (;;) {
    const chunk = await prisma.booking.findMany({
      take: batch,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      where: {
        userId: null,
        guestMobile: { not: null },
        NOT: { guestMobile: '' },
      },
      select: {
        id: true,
        guestMobile: true,
        guestName: true,
        guestFamily: true,
        createdAt: true,
      },
    })
    if (!chunk.length) break
    cursor = chunk[chunk.length - 1]!.id

    for (const row of chunk) {
      const mobile = row.guestMobile?.trim()
      if (!mobile) continue
      if (!groupOrphanBookingsByPhone([{ ...row, guestMobile: mobile }]).size) {
        invalidPhoneSkipped += 1
        continue
      }
      rows.push({
        id: row.id,
        guestMobile: mobile,
        guestName: row.guestName,
        guestFamily: row.guestFamily,
        createdAt: row.createdAt,
      })
    }
    if (chunk.length < batch) break
  }

  return { rows, invalidPhoneSkipped }
}

export async function runBackfillManualBookingAthletes(
  prisma: PrismaClient,
  opts: { dryRun: boolean },
): Promise<BackfillManualAthletesResult> {
  const { rows, invalidPhoneSkipped } = await loadOrphanGuestBookings(prisma)
  const grouped = groupOrphanBookingsByPhone(rows)

  const result: BackfillManualAthletesResult = {
    dryRun: opts.dryRun,
    orphanBookingCount: rows.length,
    distinctPhoneCount: grouped.size,
    invalidPhoneSkipped,
    wouldCreateUsers: 0,
    wouldLinkUsers: 0,
    wouldLinkBookings: 0,
    usersCreated: 0,
    usersReused: 0,
    bookingsLinked: 0,
    phones: [],
  }

  for (const [phone, bookings] of grouped) {
    const namePair = pickDeskGuestNameForBackfill(bookings)
    const phoneMasked = maskPhone(phone)
    const bookingCount = bookings.length

    if (opts.dryRun) {
      const existing = await findExistingUserByPhoneVariants(phone)
      if (existing) {
        result.wouldLinkUsers += 1
        result.wouldLinkBookings += bookingCount
        result.phones.push({ phoneMasked, bookingCount, action: 'link', guestName: namePair.name })
      }
      else {
        result.wouldCreateUsers += 1
        result.wouldLinkBookings += bookingCount
        result.phones.push({ phoneMasked, bookingCount, action: 'create', guestName: namePair.name })
      }
      continue
    }

    const existingBefore = await findExistingUserByPhoneVariants(phone)
    const user = await ensureAthleteUserByPhone(phone, namePair)
    if (!user) continue
    if (existingBefore) result.usersReused += 1
    else result.usersCreated += 1

    result.bookingsLinked += bookingCount
    result.phones.push({
      phoneMasked,
      bookingCount,
      action: existingBefore ? 'link' : 'create',
      guestName: namePair.name,
    })
  }

  return result
}