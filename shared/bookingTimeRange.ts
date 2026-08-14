/** Earliest start and latest end across booked slots (HH:MM sortable). */
export function bookingTimeRange(slots: { startTime: string; endTime?: string | null }[]) {
  if (!slots.length) return { startTime: '', endTime: '' }
  const starts = slots.map((s) => String(s.startTime || '').trim()).filter(Boolean).sort()
  const ends = slots.map((s) => String(s.endTime || s.startTime || '').trim()).filter(Boolean).sort()
  return {
    startTime: starts[0] || '',
    endTime: ends[ends.length - 1] || '',
  }
}
