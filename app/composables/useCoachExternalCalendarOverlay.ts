type CoachExternalSourceDetail = {
  source: string
  siteLabel: string
  externalClubTitle: string | null
}

type CoachExternalCell = {
  courtId: string
  startTime: string
  inboxStatus: string
  sources: string[]
  badge: string
  occupied: boolean
  sourceDetails?: CoachExternalSourceDetail[]
  externalKind?: 'busy_single' | 'busy_multi' | 'uncertain' | 'clear'
}

type CoachExternalCalendarPayload = {
  date: string
  mapped: boolean
  cells: CoachExternalCell[]
  pollIntervalMs?: number
}

function occupancyKey(courtId: string, startTime: string) {
  return `${courtId}:${startTime.slice(0, 5)}`
}

/**
 * Optional overlay for coach court booking — no-ops when external calendar module is absent.
 * Shows AloPlay / الوورزش site names on Inbox-free slots occupied elsewhere.
 */
export function useCoachExternalCalendarOverlay(opts: {
  clubId: MaybeRefOrGetter<string>
  date: MaybeRefOrGetter<string>
}) {
  const config = useRuntimeConfig()
  const enabled = computed(() => Boolean(config.public.externalCalendarModule))

  const { data, refresh, pending } = useAuthedFetch<CoachExternalCalendarPayload>(
    '/api/coach/calendar-sources',
    {
      key: 'coach-external-calendar-overlay',
      query: computed(() => ({
        clubId: toValue(opts.clubId),
        date: toValue(opts.date),
      })),
      immediate: false,
      watch: false,
      server: false,
      default: () => null,
    },
  )

  async function refreshIfEnabled() {
    if (!enabled.value || !toValue(opts.clubId)) return
    await refresh()
  }

  watch([enabled, () => toValue(opts.clubId), () => toValue(opts.date)], () => {
    void refreshIfEnabled()
  }, { immediate: true })

  const cellByKey = computed(() => {
    const map = new Map<string, CoachExternalCell>()
    for (const cell of data.value?.cells || []) {
      map.set(occupancyKey(cell.courtId, cell.startTime), cell)
    }
    return map
  })

  function externalCellFor(slot: { courtId: string; startTime: string } | null | undefined) {
    if (!enabled.value || !slot) return null
    return cellByKey.value.get(occupancyKey(slot.courtId, slot.startTime)) || null
  }

  /** Confirmed EXTERNAL_BUSY on another booking site. */
  function isExternalOnlyOccupied(slot: {
    courtId: string
    startTime: string
  } | null | undefined): boolean {
    if (!slot) return false
    const cell = externalCellFor(slot)
    if (!cell?.occupied) return false
    if (cell.externalKind === 'uncertain') return false
    return cell.sources.some((source) => source !== 'inbox')
  }

  function isExternalUncertain(slot: {
    courtId: string
    startTime: string
  } | null | undefined): boolean {
    if (!slot) return false
    if (isExternalOnlyOccupied(slot)) return false
    return externalCellFor(slot)?.externalKind === 'uncertain'
  }

  function externalSiteBadge(slot: {
    courtId: string
    startTime: string
  } | null | undefined): string {
    if (!isExternalOnlyOccupied(slot) && !isExternalUncertain(slot)) return ''
    const cell = externalCellFor(slot)
    if (!cell) return ''
    if (cell.badge) return cell.badge
    const labels = (cell.sourceDetails || [])
      .filter((detail) => detail.source !== 'inbox')
      .map((detail) => detail.siteLabel)
    if (labels.length) return labels.join(' + ')
    return ''
  }

  let pollTimer: ReturnType<typeof setInterval> | null = null

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function restartPolling() {
    stopPolling()
    if (!enabled.value || !import.meta.client) return
    const interval = data.value?.pollIntervalMs || 25_000
    pollTimer = setInterval(() => {
      void refreshIfEnabled()
    }, interval)
  }

  watch(() => [enabled.value, data.value?.pollIntervalMs] as const, () => restartPolling(), { immediate: true })

  onBeforeUnmount(() => stopPolling())

  return {
    externalOverlayEnabled: enabled,
    externalOverlayPending: pending,
    isExternalOnlyOccupied,
    isExternalUncertain,
    externalSiteBadge,
    refreshExternalOverlay: refreshIfEnabled,
  }
}
