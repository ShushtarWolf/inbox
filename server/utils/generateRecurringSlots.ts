import { datesForWeekdays, hourFromTime } from './seasonSlots'
import { formatHour, hourEnd } from './slots'
import { calculateSessionTotal, syncBookingEquipments } from './bookingTotal'

export type RecurringGuestInfo = {
  guestName: string
  guestFamily: string
  guestMobile: string
  comments?: string
  paymentMethod?: 'IPG' | 'CASH'
  paymentStatus?: 'PAID' | 'PAY_AT_CLUB'
  coachId?: string
  coachSessionPrice?: number
  equipmentId?: string
  equipmentPrice?: number
}

export async function generateRecurringCourtSlots(opts: {
  clubId: string
  courtId: string
  anchorDate: string
  weekdays: string[]
  times: string[]
  weeks?: number
  displayStatus?: 'RESERVED' | 'TEAM' | 'PENDING'
  guestInfo?: RecurringGuestInfo
}) {
  const court = await prisma.court.findFirst({
    where: { id: opts.courtId, clubId: opts.clubId },
    include: { club: true },
  })
  if (!court) throw createError({ statusCode: 404, statusMessage: 'Court not found' })

  const dates = datesForWeekdays(opts.anchorDate, opts.weekdays, opts.weeks ?? 8)
  const status = opts.displayStatus ?? 'RESERVED'
  const guest = opts.guestInfo
  const paymentMethod = guest?.paymentMethod || 'CASH'
  const paymentStatus = guest?.paymentStatus || 'PAY_AT_CLUB'
  const sessionAmount = guest
    ? calculateSessionTotal({
        courtPrice: court.price,
        equipmentPrices: guest.equipmentPrice ? [guest.equipmentPrice] : [],
        coachPrice: guest.coachSessionPrice || 0,
      })
    : court.price
  const equipmentItems = guest?.equipmentId
    ? await prisma.equipment.findMany({
        where: { id: guest.equipmentId, clubId: opts.clubId },
        select: { id: true, price: true, category: true },
      })
    : []
  let created = 0

  for (const date of dates) {
    await ensureSlotsForDate(opts.clubId, date)
    for (const time of opts.times) {
      const hour = hourFromTime(time)
      if (hour < court.club.openHour || hour >= court.club.closeHour) continue
      const startTime = formatHour(hour)
      const existing = await prisma.slot.findFirst({
        where: { courtId: court.id, date, startTime, displayStatus: { not: 'CANCELLED' } },
        include: { booking: true },
      })
      if (existing && existing.displayStatus !== 'FREE' && !existing.booking) continue

      let slotId: string
      if (existing) {
        await prisma.slot.update({
          where: { id: existing.id },
          data: { displayStatus: status },
        })
        slotId = existing.id
      } else {
        const slot = await prisma.slot.create({
          data: {
            courtId: court.id,
            date,
            startTime,
            endTime: hourEnd(hour),
            price: court.price,
            displayStatus: status,
          },
        })
        slotId = slot.id
      }

      if (guest) {
        if (existing?.booking) {
          await prisma.$transaction(async (tx) => {
            await tx.booking.update({
              where: { id: existing.booking!.id },
              data: {
                guestName: guest.guestName,
                guestFamily: guest.guestFamily,
                guestMobile: guest.guestMobile,
                comments: guest.comments,
                coachId: guest.coachId || null,
                paymentMethod,
                paymentStatus,
                status: 'CONFIRMED',
                source: 'CLUB',
              },
            })
            await syncBookingEquipments(tx, existing.booking!.id, equipmentItems)
            await tx.payment.upsert({
              where: { bookingId: existing.booking!.id },
              update: { amount: sessionAmount, method: paymentMethod, status: paymentStatus },
              create: {
                bookingId: existing.booking!.id,
                amount: sessionAmount,
                method: paymentMethod,
                status: paymentStatus,
              },
            })
          })
        } else {
          await prisma.$transaction(async (tx) => {
            const booking = await tx.booking.create({
              data: {
                slotId,
                guestName: guest.guestName,
                guestFamily: guest.guestFamily,
                guestMobile: guest.guestMobile,
                comments: guest.comments,
                coachId: guest.coachId || null,
                paymentMethod,
                paymentStatus,
                status: 'CONFIRMED',
                source: 'CLUB',
              },
            })
            await syncBookingEquipments(tx, booking.id, equipmentItems)
            await tx.payment.create({
              data: {
                bookingId: booking.id,
                amount: sessionAmount,
                method: paymentMethod,
                status: paymentStatus,
              },
            })
            await tx.reservationEvent.create({
              data: {
                bookingId: booking.id,
                type: 'CREATED',
                metadataJson: JSON.stringify({ source: 'owner-recurring' }),
              },
            })
          })
        }
      }

      created += 1
    }
  }
  return created
}
