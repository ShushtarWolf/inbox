/**
 * READ-ONLY athlete money timeline for ops complaints.
 * Query: ?userId=… or ?phone=09…
 */
import { normalizeIranPhone } from '#shared/phone.ts'
import { parseSeriesPaymentMeta, isSeriesPaymentGroup } from '#shared/athleteSeason.ts'
import { parsePaymentMetadata } from '#shared/cancelRefund.ts'
import { cancelWalletCreditAmount } from '#shared/owedCancelRefund.ts'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const userIdRaw = typeof query.userId === 'string' ? query.userId.trim() : ''
  const phoneRaw = typeof query.phone === 'string' ? query.phone.trim() : ''
  const phone = phoneRaw ? normalizeIranPhone(phoneRaw) : null

  if (!userIdRaw && !phone) {
    throw createError({ statusCode: 400, statusMessage: 'userId or phone required' })
  }

  const user = userIdRaw
    ? await prisma.user.findUnique({
        where: { id: userIdRaw },
        select: {
          id: true, name: true, nameFamily: true, phone: true, role: true, secondaryRole: true,
          _count: { select: { bookings: true } },
        },
      })
    : await prisma.user.findFirst({
        where: { phone: phone! },
        select: {
          id: true, name: true, nameFamily: true, phone: true, role: true, secondaryRole: true,
          _count: { select: { bookings: true } },
        },
      })

  if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const bookingWhere = {
    OR: [
      { userId: user.id },
      ...(user.phone ? [{ guestMobile: { contains: user.phone.slice(-10) } }] : []),
    ],
  }

  const [bookings, payments, wallet, packageBookings] = await Promise.all([
    prisma.booking.findMany({
      where: bookingWhere,
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        source: true,
        cancellationReason: true,
        cancelledAt: true,
        createdAt: true,
        guestName: true,
        guestMobile: true,
        slot: {
          select: {
            date: true,
            startTime: true,
            price: true,
            court: { select: { nameFa: true, club: { select: { slug: true, nameFa: true } } } },
          },
        },
        payment: {
          select: {
            id: true, amount: true, method: true, status: true, purpose: true,
            metadataJson: true, supersededByPaymentId: true, createdAt: true, updatedAt: true,
          },
        },
      },
    }),
    prisma.payment.findMany({
      where: {
        OR: [
          { userId: user.id },
          { booking: { userId: user.id } },
          ...(user.phone ? [{ booking: { guestMobile: { contains: user.phone.slice(-10) } } }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true, amount: true, method: true, status: true, purpose: true, bookingId: true,
        metadataJson: true, supersededByPaymentId: true, createdAt: true, updatedAt: true,
      },
    }),
    prisma.wallet.findUnique({
      where: { userId: user.id },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: {
            id: true, type: true, amount: true, note: true,
            paymentId: true, bookingId: true, createdAt: true,
          },
        },
      },
    }),
    prisma.packageBooking.findMany({
      where: { athleteId: user.id },
      take: 50,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, status: true, createdAt: true,
        package: { select: { title: true } },
        payment: { select: { id: true, amount: true, method: true, status: true } },
      },
    }).catch(() => []),
  ])

  const bookingRows = bookings.map((b) => {
    const meta = parsePaymentMetadata(b.payment?.metadataJson)
    const seriesMeta = parseSeriesPaymentMeta(b.payment?.metadataJson)
    const series = isSeriesPaymentGroup(seriesMeta)
    const owed = b.payment
      ? cancelWalletCreditAmount({
          method: b.payment.method,
          bookingPaymentMethod: b.paymentMethod,
          paymentAmount: b.payment.amount,
          metadata: meta,
        })
      : null
    return {
      id: b.id,
      status: b.status,
      paymentStatus: b.paymentStatus,
      paymentMethod: b.paymentMethod,
      source: b.source,
      cancellationReason: b.cancellationReason,
      cancelledAt: b.cancelledAt,
      createdAt: b.createdAt,
      guestName: b.guestName,
      date: b.slot.date,
      startTime: b.slot.startTime,
      slotPrice: b.slot.price,
      club: b.slot.court.club.slug,
      court: b.slot.court.nameFa,
      payment: b.payment
        ? {
            id: b.payment.id,
            amount: b.payment.amount,
            method: b.payment.method,
            status: b.payment.status,
            purpose: b.payment.purpose,
            supersededByPaymentId: b.payment.supersededByPaymentId,
            series,
            seasonBookingId: seriesMeta.seasonBookingId || null,
            sessionPrice: seriesMeta.sessionPrice ?? null,
            refundChannel: typeof meta.refundChannel === 'string' ? meta.refundChannel : null,
            refundCreditAmount: typeof meta.refundCreditAmount === 'number' ? meta.refundCreditAmount : null,
            gatewayFlag: meta.gatewayRefund === true || meta.gatewayReversed === true,
            suggestedWalletCredit: owed,
          }
        : null,
    }
  })

  const paymentRows = payments.map((p) => {
    const meta = parsePaymentMetadata(p.metadataJson)
    const seriesMeta = parseSeriesPaymentMeta(p.metadataJson)
    return {
      id: p.id,
      bookingId: p.bookingId,
      amount: p.amount,
      method: p.method,
      status: p.status,
      purpose: p.purpose,
      supersededByPaymentId: p.supersededByPaymentId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      series: isSeriesPaymentGroup(seriesMeta),
      seasonBookingId: seriesMeta.seasonBookingId || null,
      sessionPrice: seriesMeta.sessionPrice ?? null,
      refundChannel: typeof meta.refundChannel === 'string' ? meta.refundChannel : null,
      refundCreditAmount: typeof meta.refundCreditAmount === 'number' ? meta.refundCreditAmount : null,
      gatewayFlag: meta.gatewayRefund === true || meta.gatewayReversed === true,
      reconHistorical: meta.reconHistoricalCancel === true,
    }
  })

  return {
    user: {
      id: user.id,
      name: user.name,
      nameFamily: user.nameFamily,
      phone: user.phone,
      role: user.role,
      secondaryRole: user.secondaryRole,
      bookingCount: user._count.bookings,
    },
    wallet: wallet
      ? {
          id: wallet.id,
          balance: wallet.balance,
          availableBalance: wallet.availableBalance,
          transactions: wallet.transactions,
        }
      : null,
    bookings: bookingRows,
    payments: paymentRows,
    packageBookings,
  }
})
