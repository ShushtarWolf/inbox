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
  const groups = new Map<string, {
    weekdays: Set<string>
    courtIds: Set<string>
    startTime: string
    endTime: string
  }>()

  for (const rule of rules) {
    if (!rule.weekday || !rule.courtId || !rule.startTime || !rule.endTime) continue
    const key = `${rule.startTime}|${rule.endTime}`
    let group = groups.get(key)
    if (!group) {
      group = {
        weekdays: new Set(),
        courtIds: new Set(),
        startTime: rule.startTime,
        endTime: rule.endTime,
      }
      groups.set(key, group)
    }
    group.weekdays.add(rule.weekday)
    group.courtIds.add(rule.courtId)
  }

  return [...groups.values()].map((group) => ({
    weekdays: [...group.weekdays],
    startTime: group.startTime,
    endTime: group.endTime,
    courtIds: [...group.courtIds],
  }))
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
