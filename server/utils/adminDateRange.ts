/** Parse `YYYY-MM-DD` query bounds for admin reporting (UTC day boundaries). */
export function parseAdminDateBound(raw: unknown, endOfDay: boolean): Date | undefined {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return undefined
  const d = new Date(`${raw.trim()}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return undefined
  if (endOfDay) d.setUTCHours(23, 59, 59, 999)
  return d
}

export function adminPaymentCreatedAtFilter(from?: Date, to?: Date) {
  if (!from && !to) return undefined
  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  }
}
