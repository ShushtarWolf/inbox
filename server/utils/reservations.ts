export function toDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`)
}

export function diffHours(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / 3600000
}

export function canManageReservation(date: string, time: string, minimumHours: number) {
  return diffHours(new Date(), toDateTime(date, time)) >= minimumHours
}

export function addOneHour(time: string) {
  const endHour = parseInt(time.split(':')[0] || '0', 10) + 1
  return `${String(endHour).padStart(2, '0')}:00`
}
