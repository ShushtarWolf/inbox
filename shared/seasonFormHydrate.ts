import { normalizeGuestNamePair, formatGuestDisplayName } from './guestName.ts'
import { splitStoredFullName } from './userName.ts'
import type { SeasonSessionRule } from './seasonSessions.ts'

export type SeasonUiRuleRow = {
  weekdays: string[]
  startTime: string
  endTime: string
  courtIds: string[]
}

/** Merge API weekday×court rules into multi-select UI rows (same start/end). */
export function groupSeasonRulesForUi(rules: SeasonSessionRule[]): SeasonUiRuleRow[] {
  // Each UI row expands to weekdays × courts. Only group weekdays that share the exact same
  // court set for the same time range, so reloading never adds sessions that were not booked.
  const byTimeDay = new Map<string, { startTime: string; endTime: string; weekday: string; courtIds: Set<string> }>()
  for (const rule of rules) {
    if (!rule.weekday || !rule.courtId || !rule.startTime || !rule.endTime) continue
    const key = `${rule.startTime}|${rule.endTime}|${rule.weekday}`
    const row = byTimeDay.get(key) || {
      startTime: rule.startTime,
      endTime: rule.endTime,
      weekday: rule.weekday,
      courtIds: new Set<string>(),
    }
    row.courtIds.add(rule.courtId)
    byTimeDay.set(key, row)
  }

  const groups = new Map<string, SeasonUiRuleRow>()
  for (const row of byTimeDay.values()) {
    const courtIds = [...row.courtIds].sort()
    const key = `${row.startTime}|${row.endTime}|${courtIds.join(',')}`
    const group = groups.get(key) || { weekdays: [], startTime: row.startTime, endTime: row.endTime, courtIds }
    if (!group.weekdays.includes(row.weekday)) group.weekdays.push(row.weekday)
    groups.set(key, group)
  }
  return [...groups.values()]
}

/** Normalize stored guest columns for list labels and form preload. */
export function resolveSeasonGuestFields(row: {
  guestName?: string | null
  guestFamily?: string | null
}): { guestName: string; guestFamily: string; guestLabel: string } {
  let guestName = String(row.guestName || '').trim()
  let guestFamily = String(row.guestFamily || '').trim()
  if (!guestFamily && guestName.includes(' ')) {
    const split = splitStoredFullName(guestName)
    guestName = split.name
    guestFamily = split.nameFamily
  }
  const pair = normalizeGuestNamePair(guestName, guestFamily)
  return {
    guestName: pair.guestName,
    guestFamily: pair.guestFamily,
    guestLabel: formatGuestDisplayName(pair.guestName, pair.guestFamily),
  }
}
