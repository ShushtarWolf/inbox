import type { Prisma } from '@prisma/client'
import {
  isOnlinePaymentHoldCandidate,
  isReleasableOnlinePaymentHold,
  ONLINE_PAYMENT_HOLD_MS,
} from '#shared/onlinePaymentHold.ts'

type DbClient = Prisma.TransactionClient | typeof prisma

function parsePaymentMetadata(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  }
  catch {
    return {}
  }
}

function siblingIdsFromMeta(meta: Record<string, unknown>): string[] {
  const ids = meta.groupSiblingBookingIds
  if (!Array.isArray(ids)) return []
  return ids.filter((id): id is string => typeof id === 'string' && Boolean(id))
}

async function releaseOneOnlineHold(
  bookingId: string,
  opts: { now: Date; reason: string },
  db: DbClient,
): Promise<boolean> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true, slot: true },
  })
  if (!booking) return false
  if (!isReleasableOnlinePaymentHold({
    source: booking.source,
    status: booking.status,
    paymentStatus: booking.payment?.status || booking.paymentStatus,
    createdAt: booking.createdAt,
  }, opts.now)) {
    return false
  }

  const claimed = await db.booking.updateMany({
    where: {
      id: booking.id,
      source: 'PLATFORM',
      status: { in: ['PENDING', 'CONFIRMED'] },
      paymentStatus: { in: ['PENDING_ONLINE', 'FAILED'] },
      createdAt: { lt: new Date(opts.now.getTime() - ONLINE_PAYMENT_HOLD_MS) },
    },
    data: {
      status: 'CANCELLED',
      cancelledAt: opts.now,
      cancellationReason: opts.reason,
      paymentStatus: 'FAILED',
    },
  })
  if (claimed.count !== 1) return false

  await db.slot.updateMany({
    where: {
      id: booking.slotId,
      displayStatus: { in: ['PENDING', 'RESERVED'] },
    },
    data: { displayStatus: 'FREE' },
  })

  if (booking.payment && (booking.payment.status === 'PENDING_ONLINE' || booking.payment.status === 'FAILED')) {
    await db.payment.updateMany({
      where: {
        id: booking.payment.id,
        status: { in: ['PENDING_ONLINE', 'FAILED'] },
      },
      data: { status: 'FAILED' },
    })
  }

  await db.reservationEvent.create({
    data: {
      bookingId: booking.id,
      type: 'CANCELLED',
      metadataJson: JSON.stringify({ reason: opts.reason, expiredOnlineHold: true }),
    },
  })

  return true
}

/**
 * Cancel unpaid platform online holds past the 10-minute window and free their slots.
 * Race-safe: only cancels rows still PENDING/CONFIRMED + PENDING_ONLINE/FAILED.
 */
export async function releaseExpiredOnlinePaymentHolds(opts?: {
  clubId?: string
  slotIds?: string[]
  bookingIds?: string[]
  now?: Date
  reason?: string
}): Promise<{ released: number }> {
  const now = opts?.now || new Date()
  const reason = opts?.reason || 'NO_PAYMENT'
  const deadline = new Date(now.getTime() - ONLINE_PAYMENT_HOLD_MS)

  const candidates = await prisma.booking.findMany({
    where: {
      source: 'PLATFORM',
      status: { in: ['PENDING', 'CONFIRMED'] },
      paymentStatus: { in: ['PENDING_ONLINE', 'FAILED'] },
      createdAt: { lt: deadline },
      ...(opts?.bookingIds?.length ? { id: { in: opts.bookingIds } } : {}),
      ...(opts?.slotIds?.length ? { slotId: { in: opts.slotIds } } : {}),
      ...(opts?.clubId
        ? { slot: { court: { clubId: opts.clubId } } }
        : {}),
    },
    select: {
      id: true,
      payment: { select: { metadataJson: true } },
    },
    take: 200,
  })

  const toRelease = new Set<string>()
  for (const row of candidates) {
    toRelease.add(row.id)
    for (const siblingId of siblingIdsFromMeta(parsePaymentMetadata(row.payment?.metadataJson))) {
      toRelease.add(siblingId)
    }
  }

  let released = 0
  for (const bookingId of toRelease) {
    const ok = await prisma.$transaction(async (tx) => {
      return releaseOneOnlineHold(bookingId, { now, reason }, tx)
    })
    if (ok) released += 1
  }

  return { released }
}

/** After PAID: promote soft-hold PENDING → RESERVED + CONFIRMED (and multi-slot siblings). */
export async function promoteOnlineHoldOnPaid(bookingId: string, db: DbClient = prisma) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true },
  })
  if (!booking || booking.status === 'CANCELLED') return

  await db.booking.updateMany({
    where: {
      id: booking.id,
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
    data: { status: 'CONFIRMED' },
  })
  await db.slot.updateMany({
    where: {
      id: booking.slotId,
      displayStatus: { in: ['PENDING', 'RESERVED'] },
    },
    data: { displayStatus: 'RESERVED' },
  })

  const meta = parsePaymentMetadata(booking.payment?.metadataJson)
  const siblingIds = siblingIdsFromMeta(meta)
  for (const siblingId of siblingIds) {
    const sibling = await db.booking.findUnique({ where: { id: siblingId } })
    if (!sibling || sibling.status === 'CANCELLED') continue
    await db.booking.updateMany({
      where: { id: sibling.id, status: { in: ['PENDING', 'CONFIRMED'] } },
      data: { status: 'CONFIRMED' },
    })
    await db.slot.updateMany({
      where: {
        id: sibling.slotId,
        displayStatus: { in: ['PENDING', 'RESERVED'] },
      },
      data: { displayStatus: 'RESERVED' },
    })
  }
}

/** True when an unpaid online hold is still within the payable window. */
export function assertOnlineHoldPayable(booking: {
  source?: string | null
  status?: string | null
  paymentStatus?: string | null
  createdAt: Date
}, now: Date = new Date()) {
  if (booking.status === 'CANCELLED') {
    throw createError({ statusCode: 409, statusMessage: 'HOLD_EXPIRED' })
  }
  if (!isOnlinePaymentHoldCandidate(booking)) return
  if (isReleasableOnlinePaymentHold(booking, now)) {
    throw createError({ statusCode: 409, statusMessage: 'HOLD_EXPIRED' })
  }
}
