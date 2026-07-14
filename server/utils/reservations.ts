import { minutesUntilSlotStart, todayDateString } from '#shared/localDate.ts'

export function toDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`)
}

export function diffHours(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / 3600000
}

export function canManageReservation(date: string, time: string, minimumHours: number) {
  return minutesUntilSlotStart(date, time) >= minimumHours * 60
}

export function assertSlotBookable(date: string, startTime: string) {
  if (minutesUntilSlotStart(date, startTime) <= 0) {
    throw createError({ statusCode: 409, statusMessage: 'SLOT_IN_PAST' })
  }
}

export function assertDateNotInPast(date: string) {
  const today = todayDateString()
  if (date < today) {
    throw createError({ statusCode: 400, statusMessage: 'DATE_IN_PAST' })
  }
}

export function addOneHour(time: string) {
  const endHour = parseInt(time.split(':')[0] || '0', 10) + 1
  return `${String(endHour).padStart(2, '0')}:00`
}
