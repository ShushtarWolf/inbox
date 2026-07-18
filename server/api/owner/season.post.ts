import { getPaymentsMode } from '#shared/payments.ts'
import { expandDayTimeRanges, type DayTimeRange } from '#shared/recurringSessions.ts'
import { generateRecurringCourtSlots } from '../../utils/generateRecurringSlots'
import { equipmentPriceAtBooking } from '../../utils/bookingTotal'
import { assertDateNotInPast } from '../../utils/reservations'

function resolveDayTimes(
  dayTimes?: Record<string, DayTimeRange>,
  times?: string[],
  days?: string[],
): { storedJson: string; expanded: Record<string, string[]> } {
  if (dayTimes && Object.keys(dayTimes).length) {
    const expanded = expandDayTimeRanges(dayTimes)
    return { storedJson: JSON.stringify(dayTimes), expanded }
  }
  if (times?.length && days?.length) {
    const endHour = Number.parseInt(times[times.length - 1].slice(0, 2), 10) + 1
    const legacyRange = { start: times[0], end: `${String(endHour).padStart(2, '0')}:00` }
    const mapped = Object.fromEntries(days.map((day) => [day, legacyRange])) as Record<string, DayTimeRange>
    return { storedJson: JSON.stringify(mapped), expanded: expandDayTimeRanges(mapped) }
  }
  return { storedJson: JSON.stringify(dayTimes || times || []), expanded: {} }
}

export default defineEventHandler(async (event) => {
  const { club } = await requireOwnerClub(event, 'calendar')
  const body = await readBody<{
    guestName?: string
    guestFamily?: string
    guestMobile?: string
    days?: string[]
    times?: string[]
    dayTimes?: Record<string, DayTimeRange>
    startDate?: string
    finishDate?: string
    comments?: string
    slotId?: string
    equipmentId?: string
    paymentMethod?: string
    paymentStatus?: string
  }>(event)

  if (!body.startDate || !body.finishDate) {
    throw createError({ statusCode: 400, statusMessage: 'Start and finish dates are required' })
  }
  if (body.finishDate < body.startDate) {
    throw createError({ statusCode: 400, statusMessage: 'Finish date must be on or after start date' })
  }
  assertDateNotInPast(body.startDate)

  let equipmentPrice = 0
  if (body.equipmentId) {
    const equipment = await prisma.equipment.findFirst({
      where: { id: body.equipmentId, clubId: club.id },
    })
    if (equipment) equipmentPrice = equipmentPriceAtBooking(equipment)
  }

  const { storedJson, expanded } = resolveDayTimes(body.dayTimes, body.times, body.days)

  const record = await prisma.seasonBooking.create({
    data: {
      clubId: club.id,
      guestName: body.guestName || '',
      guestFamily: body.guestFamily || '',
      guestMobile: body.guestMobile || '',
      daysJson: JSON.stringify(body.days || []),
      timesJson: storedJson,
      startDate: body.startDate,
      finishDate: body.finishDate,
      comments: body.comments,
      equipmentId: body.equipmentId || null,
      equipmentPrice,
    },
  })

  let slotsCreated = 0
  const hasSchedule = body.days?.length && Object.keys(expanded).length
  if (body.slotId && hasSchedule) {
    const slot = await prisma.slot.findFirst({
      where: { id: body.slotId, court: { clubId: club.id } },
    })
    if (slot) {
      slotsCreated = await generateRecurringCourtSlots({
        clubId: club.id,
        courtId: slot.courtId,
        anchorDate: body.startDate,
        weekdays: body.days!,
        dayTimes: expanded,
        startDate: body.startDate,
        finishDate: body.finishDate,
        displayStatus: 'RESERVED',
        guestInfo: {
          guestName: body.guestName || '',
          guestFamily: body.guestFamily || '',
          guestMobile: body.guestMobile || '',
          comments: body.comments,
          paymentMethod: getPaymentsMode() === 'pay_at_club'
            ? 'CASH'
            : ((body.paymentMethod as 'IPG' | 'CASH' | undefined) || 'CASH'),
          paymentStatus: body.paymentStatus === 'PAID' ? 'PAID' : 'PAY_AT_CLUB',
          equipmentId: body.equipmentId,
          equipmentPrice,
        },
      })
    }
  }

  return { ...record, slotsCreated }
})
