/**
 * Pure range-calendar tap logic (AppJalaliCalendar mode="range").
 *
 * Default: first tap = start, second = end; on a complete range the tap moves the NEARER endpoint.
 * `lockStart` (season edit whose start is already in the past): the start never moves and every
 * tap on/after the start sets the END, so the owner can shorten or extend the season end.
 */
export type RangePickState = { start: string; end: string }

export function pickRangeDay(
  state: RangePickState,
  iso: string,
  opts: { minDate?: string; lockStart?: boolean } = {},
): RangePickState {
  const { start, end } = state
  if (opts.minDate && iso < opts.minDate) return state
  if (opts.lockStart && start) {
    if (iso < start) return state
    return { start, end: iso }
  }
  if (!start) return { start: iso, end: '' }
  if (!end) {
    if (iso < start) return { start: iso, end: start }
    return { start, end: iso }
  }
  if (iso <= start) return { start: iso, end }
  if (iso >= end) return { start, end: iso }
  const startMs = Date.parse(`${start}T12:00:00Z`)
  const endMs = Date.parse(`${end}T12:00:00Z`)
  const tapMs = Date.parse(`${iso}T12:00:00Z`)
  return Math.abs(tapMs - startMs) <= Math.abs(tapMs - endMs) ? { start: iso, end } : { start, end: iso }
}

/**
 * Season edit date rules (server + client).
 * A season whose stored start is in the past keeps that start: the edit may send it unchanged,
 * but may never move the start to another past day. A changed end must be today or later.
 */
export type SeasonEditDateError = 'START_IN_PAST' | 'FINISH_IN_PAST' | 'FINISH_BEFORE_START'

export function seasonEditDateError(opts: {
  storedStart: string | null | undefined
  storedFinish: string | null | undefined
  startDate: string
  finishDate: string
  today: string
}): SeasonEditDateError | null {
  if (opts.finishDate < opts.startDate) return 'FINISH_BEFORE_START'
  if (opts.startDate !== (opts.storedStart || '') && opts.startDate < opts.today) return 'START_IN_PAST'
  if (opts.finishDate !== (opts.storedFinish || '') && opts.finishDate < opts.today) return 'FINISH_IN_PAST'
  return null
}

/** Lock the start in edit mode when the stored season start is before today. */
export function seasonEditLocksStart(storedStart: string | null | undefined, today: string): boolean {
  return Boolean(storedStart && storedStart < today)
}
