import { initialPlatformPaymentFields, isOnlinePaymentsEnabled } from '#shared/bookingPayment.ts'
import { computeBookingPrice } from '#shared/courtPricing.ts'
import { notifyBookingConfirmed, clubNotifyName } from '../../utils/bookingNotify'
import {
  loadEquipmentForBooking,
  sumEquipmentPrices,
  syncBookingEquipments,
} from '../../utils/bookingTotal'
import { rethrowSlotConflict, SlotNotAvailableError } from '../../utils/prismaErrors'
import { assertSlotBookable } from '../../utils/reservations'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{
    slotId?: string
    slotIds?: string[]
    equipmentIds?: string[]
  }>(event)

  const slotIds = [...new Set(
    (body.slotIds?.length ? body.slotIds : body.slotId ? [body.slotId] : [])
      .filter((id): id is string => Boolean(id)),
  )]
  if (!slotIds.length) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  const slots = await prisma.slot.findMany({
    where: { id: { in: slotIds } },
    include: { court: { include: { club: true } }, booking: true },
  })
  if (slots.length !== slotIds.length) {
    throw createError({ statusCode: 404, statusMessage: 'Slot not found' })
  }

  const clubId = slots[0]!.court.clubId
  const club = slots[0]!.court.club
  if (club.status !== 'ACTIVE') {
    throw createError({ statusCode: 404, statusMessage: 'Club not found' })
  }
  for (const slot of slots) {
    if (slot.court.clubId !== clubId) {
      throw createError({ statusCode: 400, statusMessage: 'Slots must belong to the same club' })
    }
    const staleCancelledBooking = slot.displayStatus === 'FREE' && slot.booking?.status === 'CANCELLED'
      ? slot.booking
      : null
    if (slot.displayStatus !== 'FREE' || (slot.booking && !staleCancelledBooking)) {
      throw createError({ statusCode: 409, statusMessage: 'Slot not available' })
    }
    assertSlotBookable(slot.date, slot.startTime)
  }

  // Preserve caller order for primary-slot payment grouping.
  const orderedSlots = slotIds.map((id) => slots.find((s) => s.id === id)!)

  const equipmentIds = [...new Set(body.equipmentIds || [])]
  const equipmentItems = await loadEquipmentForBooking(clubId, equipmentIds)
  if (equipmentIds.length && equipmentItems.length !== equipmentIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid equipment' })
  }
  const equipmentTotal = sumEquipmentPrices(equipmentItems)

  const slotAmounts = orderedSlots.map((slot) => computeBookingPrice(
    slot.price,
    slot.court.pricingJson,
    slot.date,
    slot.startTime,
  ))
  const totalAmount = slotAmounts.reduce((sum, n) => sum + n, 0) + equipmentTotal

  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })

  let primaryBookingId = ''
  let paymentStatus = ''
  const bookingIds: string[] = []

  try {
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < orderedSlots.length; i++) {
        const slot = orderedSlots[i]!
        const isPrimary = i === 0
        // Online multi-slot: charge the combined total on the primary payment so one
        // gateway checkout covers the sheet total; siblings are amount 0 + linked.
        // Pay-at-club: each booking keeps its own desk amount (+ equipment on primary).
        const groupOnPrimary = orderedSlots.length > 1 && isOnlinePaymentsEnabled()
        const amount = isPrimary
          ? (groupOnPrimary ? totalAmount : slotAmounts[i]! + equipmentTotal)
          : (groupOnPrimary ? 0 : slotAmounts[i]!)
        const paymentFields = initialPlatformPaymentFields(amount)

        const staleCancelledBooking = slot.displayStatus === 'FREE' && slot.booking?.status === 'CANCELLED'
          ? slot.booking
          : null

        const claimed = await tx.slot.updateMany({
          where: { id: slot.id, displayStatus: 'FREE' },
          data: { displayStatus: 'RESERVED' },
        })
        if (claimed.count !== 1) {
          throw new SlotNotAvailableError()
        }
        if (staleCancelledBooking) {
          await tx.booking.delete({ where: { id: staleCancelledBooking.id } })
        }

        const booking = await tx.booking.create({
          data: {
            slotId: slot.id,
            userId: user.id,
            guestName: dbUser.name,
            guestMobile: dbUser.phone,
            paymentStatus: paymentFields.paymentStatus,
            source: 'PLATFORM',
            status: 'CONFIRMED',
          },
        })
        bookingIds.push(booking.id)
        if (isPrimary) {
          primaryBookingId = booking.id
          paymentStatus = paymentFields.paymentStatus
        }

        await tx.payment.create({
          data: {
            bookingId: booking.id,
            ...paymentFields.payment,
          },
        })

        if (isPrimary && equipmentItems.length) {
          await syncBookingEquipments(tx, booking.id, equipmentItems)
        }

        await tx.reservationEvent.create({
          data: {
            bookingId: booking.id,
            actorUserId: user.id,
            type: 'CREATED',
            metadataJson: JSON.stringify({
              source: 'platform',
              groupSize: orderedSlots.length,
              isPrimary,
            }),
          },
        })
      }

      // Link sibling payments to primary for post-pay sync (online multi only).
      if (orderedSlots.length > 1 && isOnlinePaymentsEnabled() && primaryBookingId) {
        const siblingIds = bookingIds.slice(1)
        await tx.payment.update({
          where: { bookingId: primaryBookingId },
          data: {
            metadataJson: JSON.stringify({
              groupPrimaryBookingId: primaryBookingId,
              groupSiblingBookingIds: siblingIds,
            }),
          },
        })
        for (const siblingId of siblingIds) {
          await tx.payment.update({
            where: { bookingId: siblingId },
            data: {
              metadataJson: JSON.stringify({
                coveredByBookingId: primaryBookingId,
              }),
            },
          })
        }
      }
    })
  }
  catch (error: unknown) {
    rethrowSlotConflict(error)
  }

  for (const slot of orderedSlots) {
    await notifyBookingConfirmed({
      userId: user.id,
      email: dbUser.email,
      phone: dbUser.phone,
      kind: 'court',
      clubName: clubNotifyName(club),
      clubId,
      bookingId: bookingIds[orderedSlots.indexOf(slot)]!,
      date: slot.date,
      startTime: slot.startTime,
    })
  }

  return {
    id: primaryBookingId,
    paymentStatus,
    bookingIds,
    totalAmount,
  }
})
