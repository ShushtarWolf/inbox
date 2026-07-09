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
