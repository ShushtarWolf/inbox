import type { Prisma } from '@prisma/client'
import { countsTowardRevenue } from '#shared/bookingPayment.ts'
import { resolveLinkedGuestDisplayName } from '#shared/guestName.ts'
import { iranPhoneStorageVariants, normalizeIranPhone } from '#shared/phone.ts'

type Db = Prisma.TransactionClient | typeof prisma

export type ContactBookingRow = {
  status: string
  guestName?: string | null
  guestFamily?: string | null
  guestMobile?: string | null
  noShowAt?: Date | null
  paymentStatus?: string | null
  payment?: { status?: string | null; amount?: number | null } | null
  user?: { name?: string | null; phone?: string | null } | null
  slot: { date: string; price: number }
}

export function paymentStatusOf(booking: {
  payment?: { status?: string | null } | null
  paymentStatus?: string | null
}) {
  return booking.payment?.status || booking.paymentStatus || 'PAY_AT_CLUB'
}

export function bookingSpendAmount(booking: ContactBookingRow): number {
  const status = paymentStatusOf(booking)
  if (!countsTowardRevenue(booking.status, status)) return 0
  const amount = booking.payment?.amount
  if (typeof amount === 'number' && Number.isFinite(amount)) return amount
  return booking.slot.price
}

export function daysSinceIsoDate(isoDate: string, now = new Date()): number {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return 0
  const then = new Date(year, month - 1, day)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.floor((today.getTime() - then.getTime()) / 86400000))
}

export function resolveContactName(bookings: ContactBookingRow[]): string {
  // Prefer any linked account name first so one desk typo cannot rename the CRM contact.
  for (const booking of bookings) {
    const account = booking.user?.name?.trim()
    if (account) return account
  }
  for (const booking of bookings) {
    const name = resolveLinkedGuestDisplayName({
      guestName: booking.guestName,
      guestFamily: booking.guestFamily,
      userName: booking.user?.name,
    })
    if (name) return name
  }
  return ''
}

export function computeContactMetrics(bookings: ContactBookingRow[], now = new Date()) {
  const active = bookings.filter((booking) => booking.status !== 'CANCELLED')
  const latestActive = active[0]
  const latestAny = bookings[0]
  const latestSlotDate = latestActive?.slot.date || latestAny?.slot.date || null

  return {
    totalVisits: active.length,
    noShowCount: active.filter((booking) => booking.noShowAt).length,
    lifetimeValue: active.reduce((sum, booking) => sum + bookingSpendAmount(booking), 0),
    lastBookedAt: latestSlotDate ? new Date(`${latestSlotDate}T12:00:00`) : null,
    inactiveDays: latestSlotDate ? daysSinceIsoDate(latestSlotDate, now) : 0,
    lastVisit: latestSlotDate,
  }
}

function bookingMobileWhere(clubId: string, mobile: string): Prisma.BookingWhereInput {
  const variants = iranPhoneStorageVariants(mobile)
  return {
    slot: { court: { clubId } },
    OR: [
      ...(variants.length ? [{ guestMobile: { in: variants } }] : []),
      ...(variants.length ? [{ user: { phone: { in: variants } } }] : []),
    ],
  }
}

export async function syncClubContactByClubAndMobile(
  clubId: string,
  rawMobile: string,
  db: Db = prisma,
): Promise<string | null> {
  const mobile = normalizeIranPhone(rawMobile) || rawMobile.trim()
  if (!mobile) return null

  const bookings = await db.booking.findMany({
    where: bookingMobileWhere(clubId, mobile),
    include: {
      payment: true,
      user: { select: { name: true, phone: true } },
      slot: { select: { date: true, price: true } },
    },
    orderBy: [{ slot: { date: 'desc' } }, { createdAt: 'desc' }],
  })
  if (!bookings.length) return null

  const metrics = computeContactMetrics(bookings)
  const name = resolveContactName(bookings.filter((booking) => booking.status !== 'CANCELLED'))
    || resolveContactName(bookings)
    || mobile
  const variants = iranPhoneStorageVariants(mobile)
  const existing = await db.contact.findFirst({
    where: {
      clubId,
      OR: variants.map((variant) => ({ mobile: variant })),
    },
  })

  const data = {
    name,
    mobile,
    source: 'booking',
    ...metrics,
  }

  if (existing) {
    await db.contact.update({ where: { id: existing.id }, data })
    return existing.id
  }

  const created = await db.contact.create({
    data: {
      clubId,
      ...data,
    },
  })
  return created.id
}

export async function syncClubContactByBookingId(bookingId: string, db: Db = prisma): Promise<string | null> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      slot: { include: { court: { select: { clubId: true } } } },
      user: { select: { phone: true } },
    },
  })
  if (!booking) return null
  const rawMobile = booking.guestMobile || booking.user?.phone
  if (!rawMobile) return null
  return syncClubContactByClubAndMobile(booking.slot.court.clubId, rawMobile, db)
}

/** Best-effort CRM sync — never throw to booking/payment callers. */
export async function syncClubContactForBooking(bookingId: string): Promise<void> {
  try {
    await syncClubContactByBookingId(bookingId)
  }
  catch (err) {
    console.error('[contactSync:booking]', bookingId, err)
  }
}

export async function backfillClubContacts(clubId: string, db: Db = prisma): Promise<number> {
  const bookings = await db.booking.findMany({
    where: { slot: { court: { clubId } } },
    select: {
      guestMobile: true,
      user: { select: { phone: true } },
    },
  })

  const mobiles = new Set<string>()
  for (const booking of bookings) {
    const raw = booking.guestMobile || booking.user?.phone
    const mobile = normalizeIranPhone(raw) || raw?.trim()
    if (mobile) mobiles.add(mobile)
  }

  let synced = 0
  for (const mobile of mobiles) {
    const id = await syncClubContactByClubAndMobile(clubId, mobile, db)
    if (id) synced += 1
  }
  return synced
}
