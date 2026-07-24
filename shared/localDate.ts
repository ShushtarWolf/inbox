const TEHRAN_TZ = 'Asia/Tehran'

/** YYYY-MM-DD in the given timezone (default: Asia/Tehran). */
export function localDateString(date = new Date(), timeZone = TEHRAN_TZ) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function todayDateString(timeZone = TEHRAN_TZ) {
  return localDateString(new Date(), timeZone)
}

/** HH:mm in the given timezone (default: Asia/Tehran). */
export function localTimeString(date = new Date(), timeZone = TEHRAN_TZ) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function parseTimeMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + (minutes || 0)
}

/** Adds (or subtracts) whole days to a YYYY-MM-DD date string, returning a YYYY-MM-DD string. */
export function addDaysToIsoDate(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * 86400000)
  const yyyy = shifted.getUTCFullYear()
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(shifted.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function daysBetweenCalendarDates(from: string, to: string) {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number)
  const [toYear, toMonth, toDay] = to.split('-').map(Number)
  const fromUtc = Date.UTC(fromYear, fromMonth - 1, fromDay)
  const toUtc = Date.UTC(toYear, toMonth - 1, toDay)
  return Math.round((toUtc - fromUtc) / 86400000)
}

/** Minutes from now until slot start; negative means the slot already started. */
export function minutesUntilSlotStart(
  date: string,
  startTime: string,
  now = new Date(),
  timeZone = TEHRAN_TZ,
) {
  const today = localDateString(now, timeZone)
  const nowMinutes = parseTimeMinutes(localTimeString(now, timeZone))
  const slotMinutes = parseTimeMinutes(startTime)

  if (date < today) return -1
  if (date === today) return slotMinutes - nowMinutes
  const dayDiff = daysBetweenCalendarDates(today, date)
  return dayDiff * 24 * 60 + slotMinutes - nowMinutes
}

export function isPastDate(date: string, now = new Date(), timeZone = TEHRAN_TZ) {
  return date < localDateString(now, timeZone)
}

export function isSlotStartInPast(
  date: string,
  startTime: string,
  now = new Date(),
  timeZone = TEHRAN_TZ,
) {
  return minutesUntilSlotStart(date, startTime, now, timeZone) <= 0
}
