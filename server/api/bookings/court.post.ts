import { initialPlatformPaymentFields, isOnlinePaymentsEnabled } from '#shared/bookingPayment.ts'
import { bookingTimeRange } from '#shared/bookingTimeRange.ts'
import { computeBookingPrice, computeListedSlotPrice } from '#shared/courtPricing.ts'
import { initialOnlineCourtHoldDisplay } from '#shared/onlinePaymentHold.ts'
import { notifyBookingConfirmed, clubNotifyName, clubNotifyLocation, courtNotifyName, personNotifyName } from '../../utils/bookingNotify'
import {
  loadEquipmentForBooking,
  parseEquipmentSelections,
  sumEquipmentPrices,
  syncBookingEquipments,
} from '../../utils/bookingTotal'
import {
  discountPaymentMetadata,
  redeemDiscountCode,
  resolveDiscountForBooking,
} from '../../utils/discountCodes'
import { releaseExpiredOnlinePaymentHolds } from '../../utils/onlinePaymentHold'
import { syncClubContactForBooking } from '../../utils/contactSync'
import { rethrowSlotConflict, SlotNotAvailableError } from '../../utils/prismaErrors'
import { assertSlotBookable } from '../../utils/reservations'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{
    slotId?: string
    slotIds?: string[]
    equipmentIds?: string[]
    equipmentQuantities?: Record<string, number>
    discountCode?: string
  }>(event)

  const slotIds = [...new Set(
    (body.slotIds?.length ? body.slotIds : body.slotId ? [body.slotId] : [])
      .filter((id): id is string => Boolean(id)),
  )]
  if (!slotIds.length) throw createError({ statusCode: 400, statusMessage: 'slotId required' })

  // Free any stale unpaid online holds on these slots before availability checks.
  await releaseExpiredOnlinePaymentHolds({ slotIds })

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

  const equipmentSelections = parseEquipmentSelections(body.equipmentIds, body.equipmentQuantities)
  const primarySlot = orderedSlots[0]!
  const equipmentItems = await loadEquipmentForBooking(clubId, equipmentSelections, {
    date: primarySlot.date,
    startTime: primarySlot.startTime,
  })
  if (equipmentSelections.length && equipmentItems.length !== equipmentSelections.length) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid equipment' })
  }
  const equipmentTotal = sumEquipmentPrices(equipmentItems)

  const slotAmounts = orderedSlots.map((slot) => {
    // Charge live court listing (base + bands), not a stale Slot.price snapshot.
    const listed = computeListedSlotPrice(slot.court.price, slot.startTime, slot.court.pricingJson)
    return computeBookingPrice(listed, slot.court.pricingJson, slot.date, slot.startTime)
  })
  const subtotal = slotAmounts.reduce((sum, n) => sum + n, 0) + equipmentTotal
  const discount = await resolveDiscountForBooking({
    code: body.discountCode,
    clubId,
    subtotal,
    userId: user.id,
  })
  const totalAmount = discount ? discount.total : subtotal
  const discountAmount = discount?.discountAmount || 0

  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
  const onlineEnabled = isOnlinePaymentsEnabled()
  const holdDisplay = initialOnlineCourtHoldDisplay(onlineEnabled)

  let primaryBookingId = ''
  let paymentStatus = ''
  const bookingIds: string[] = []

  try {
    await prisma.$transaction(async (tx) => {
      let remainingDiscount = discountAmount
      for (let i = 0; i < orderedSlots.length; i++) {
        const slot = orderedSlots[i]!
        const isPrimary = i === 0
        // Online multi-slot: charge the combined total on the primary payment so one
        // gateway checkout covers the sheet total; siblings are amount 0 + linked.
        // Pay-at-club: each booking keeps its own desk amount (+ equipment on primary),
        // with percent discount applied across lines (primary first).
        const groupOnPrimary = orderedSlots.length > 1 && onlineEnabled
        let amount: number
        if (groupOnPrimary) {
          amount = isPrimary ? totalAmount : 0
        }
        else {
          const base = isPrimary ? slotAmounts[i]! + equipmentTotal : slotAmounts[i]!
          const cut = Math.min(base, remainingDiscount)
          remainingDiscount -= cut
          amount = base - cut
        }
        const paymentFields = initialPlatformPaymentFields(amount)
        const discountMeta = isPrimary && discount
          ? discountPaymentMetadata(discount)
          : null

        const staleCancelledBooking = slot.displayStatus === 'FREE' && slot.booking?.status === 'CANCELLED'
          ? slot.booking
          : null

        const claimed = await tx.slot.updateMany({
          where: { id: slot.id, displayStatus: 'FREE' },
          data: { displayStatus: holdDisplay.displayStatus },
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
            status: holdDisplay.bookingStatus,
          },
        })
        bookingIds.push(booking.id)
        if (isPrimary) {
          primaryBookingId = booking.id
          paymentStatus = paymentFields.paymentStatus
        }

        const basePaymentMeta = discountMeta ? { ...discountMeta } : {}
        await tx.payment.create({
          data: {
            bookingId: booking.id,
            ...paymentFields.payment,
            ...(Object.keys(basePaymentMeta).length
              ? { metadataJson: JSON.stringify(basePaymentMeta) }
              : {}),
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
              ...(discount && isPrimary
                ? { discountCode: discount.code, discountAmount: discount.discountAmount }
                : {}),
            }),
          },
        })
      }

      if (discount) {
        await redeemDiscountCode(tx, discount.id)
      }

      // Link sibling payments to primary for post-pay sync (online multi only).
      if (orderedSlots.length > 1 && onlineEnabled && primaryBookingId) {
        const siblingIds = bookingIds.slice(1)
        const primaryPayment = await tx.payment.findUniqueOrThrow({ where: { bookingId: primaryBookingId } })
        let existingMeta: Record<string, unknown> = {}
        if (primaryPayment.metadataJson) {
          try {
            existingMeta = JSON.parse(primaryPayment.metadataJson) as Record<string, unknown>
          }
          catch {
            existingMeta = {}
          }
        }
        await tx.payment.update({
          where: { bookingId: primaryBookingId },
          data: {
            metadataJson: JSON.stringify({
              ...existingMeta,
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

  for (const bookingId of bookingIds) {
    await syncClubContactForBooking(bookingId)
  }

  // Online soft-holds wait for PAID before "رزرو تایید شد"; pay-at-club confirms now.
  if (!onlineEnabled) {
    const groups = new Map<string, typeof orderedSlots>()
    for (const slot of orderedSlots) {
      const key = `${slot.date}|${slot.courtId}`
      const list = groups.get(key) || []
      list.push(slot)
      groups.set(key, list)
    }
    for (const group of groups.values()) {
      const range = bookingTimeRange(group)
      await notifyBookingConfirmed({
        userId: user.id,
        email: dbUser.email,
        phone: dbUser.phone,
        kind: 'court',
        clubName: clubNotifyName(club),
        clubId,
        bookingId: bookingIds[orderedSlots.indexOf(group[0]!)]!,
        date: group[0]!.date,
        startTime: range.startTime,
        endTime: range.endTime,
        courtName: courtNotifyName(group[0]!.court),
        paymentPaid: paymentStatus === 'PAID',
        guestName: personNotifyName(dbUser.name),
        ...clubNotifyLocation(club),
      })
    }
  }

  return {
    id: primaryBookingId,
    paymentStatus,
    bookingIds,
    totalAmount,
    discountAmount,
    discountCode: discount?.code || null,
  }
})
