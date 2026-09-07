import type { SourceName } from './reconcile'

export type CourtHours = {
  id: string
  effectiveOpenHour: number
  effectiveCloseHour: number
}

export type AdapterVerdictInput = {
  supported: boolean
  source: string
  slotVerdicts?: Array<{
    courtKey: string
    startTime: string
    endTime?: string
    verdict: 'FREE' | 'BUSY' | 'UNKNOWN' | 'STALE'
    source: string
  }>
  occupied?: Array<{
    courtKey: string
    startTime: string
    endTime: string
    source: string
  }>
}

export type ReconcileVerdictRow = {
  courtKey: string
  startTime: string
  endTime: string
  verdict: 'FREE' | 'BUSY' | 'UNKNOWN' | 'STALE'
  source: SourceName
}

function addMinutes(startTime: string, durationMinutes: number): string {
  const match = startTime.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return startTime
  const total = Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10) + durationMinutes
  const hour = Math.floor(total / 60) % 24
  const minute = ((total % 60) + 60) % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function buildSessionStarts(
  openHour: number,
  closeHour: number,
  durationMinutes: number,
): string[] {
  const times: string[] = []
  const openTotal = openHour * 60
  const closeTotal = closeHour * 60
  for (let minutes = openTotal; minutes + durationMinutes <= closeTotal; minutes += durationMinutes) {
    const hour = Math.floor(minutes / 60)
    const minute = minutes % 60
    times.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
  }
  return times
}

function asSourceName(source: string): SourceName | null {
  if (source === 'aloplay' || source === 'alovarzesh' || source === 'courtic') return source
  return null
}

/**
 * When a supported adapter wipes / total-fails with empty slotVerdicts, emit UNKNOWN
 * for every court hour so another source's lone BUSY cannot become EXTERNAL_BUSY.
 */
export function unknownVerdictsForCourtHours(
  courts: CourtHours[],
  source: SourceName,
  sessionDurationMinutes: number,
): ReconcileVerdictRow[] {
  const out: ReconcileVerdictRow[] = []
  for (const court of courts) {
    const starts = buildSessionStarts(
      court.effectiveOpenHour,
      court.effectiveCloseHour,
      sessionDurationMinutes,
    )
    for (const startTime of starts) {
      out.push({
        courtKey: court.id,
        startTime,
        endTime: addMinutes(startTime, sessionDurationMinutes),
        verdict: 'UNKNOWN',
        source,
      })
    }
  }
  return out
}

/**
 * Build the verdict list fed into reconcileConfirmedBusy.
 * Supported + empty slotVerdicts → pad UNKNOWN (availability-first).
 * Unsupported → contribute nothing (single mapped source BUSY may still confirm).
 */
export function verdictsForReconcile(opts: {
  adapters: AdapterVerdictInput[]
  courts: CourtHours[]
  sessionDurationMinutes: number
}): ReconcileVerdictRow[] {
  const out: ReconcileVerdictRow[] = []
  for (const adapter of opts.adapters) {
    const source = asSourceName(adapter.source)
    if (!source) continue

    if (adapter.supported && !(adapter.slotVerdicts?.length)) {
      out.push(
        ...unknownVerdictsForCourtHours(opts.courts, source, opts.sessionDurationMinutes),
      )
      continue
    }

    if (adapter.slotVerdicts?.length) {
      for (const row of adapter.slotVerdicts) {
        const rowSource = asSourceName(row.source) ?? source
        out.push({
          courtKey: row.courtKey,
          startTime: row.startTime,
          endTime: (row.endTime ?? addMinutes(row.startTime, opts.sessionDurationMinutes)).slice(0, 5),
          verdict: row.verdict,
          source: rowSource,
        })
      }
      continue
    }

    // Legacy fallback: occupied without slotVerdicts on unsupported/odd paths → BUSY rows.
    for (const slot of adapter.occupied ?? []) {
      out.push({
        courtKey: slot.courtKey,
        startTime: slot.startTime,
        endTime: slot.endTime,
        verdict: 'BUSY',
        source,
      })
    }
  }
  return out
}
