type OwnerExternalSourceDetail = {
  source: string
  siteLabel: string
  externalClubTitle: string | null
}

type OwnerExternalCell = {
  courtId: string
  startTime: string
  inboxStatus: string
  sources: string[]
  badge: string
  occupied: boolean
  sourceDetails?: OwnerExternalSourceDetail[]
  ownerNote?: string | null
}

type OwnerExternalCalendarPayload = {
  date: string
  mapped: boolean
  cells: OwnerExternalCell[]
  pollIntervalMs?: number
}

function occupancyKey(courtId: string, startTime: string) {
  return `${courtId}:${startTime.slice(0, 5)}`
}

/**
 * Optional overlay for owner main calendar — no-ops when external calendar module is absent.
 * Shows Aloplay / الوورزش (etc.) site names; athlete public API stays anonymous.
 */
export function useOwnerExternalCalendarOverlay(opts: {
  date: MaybeRefOrGetter<string>
}) {
  const config = useRuntimeConfig()
  const enabled = computed(() => Boolean(config.public.externalCalendarModule))

  const { data, refresh, pending } = useAuthedFetch<OwnerExternalCalendarPayload>(
    '/api/owner/calendar-sources',
    {
      key: 'owner-external-calendar-overlay',
      query: computed(() => ({ date: toValue(opts.date) })),
      immediate: false,
      watch: false,
      server: false,
      default: () => null,
    },
  )

  async function refreshIfEnabled() {
    if (!enabled.value) return
    await refresh()
  }

  watch([enabled, () => toValue(opts.date)], () => {
    void refreshIfEnabled()
  }, { immediate: true })

  const cellByKey = computed(() => {
    const map = new Map<string, OwnerExternalCell>()
    for (const cell of data.value?.cells || []) {
      map.set(occupancyKey(cell.courtId, cell.startTime), cell)
    }
    return map
  })

  function externalCellFor(slot: { courtId: string; startTime: string } | null | undefined) {
    if (!enabled.value || !slot) return null
    return cellByKey.value.get(occupancyKey(slot.courtId, slot.startTime)) || null
  }

  /** Inbox FREE but occupied on another booking site — show site name(s). */
  function isExternalOnlyOccupied(slot: {
    courtId: string
    startTime: string
    displayStatus?: string
  } | null | undefined): boolean {
    if (!slot || slot.displayStatus !== 'FREE') return false
    const cell = externalCellFor(slot)
    if (!cell?.occupied) return false
    return cell.sources.some((source) => source !== 'inbox')
  }

  function externalSiteBadge(slot: {
    courtId: string
    startTime: string
    displayStatus?: string
  } | null | undefined): string {
    if (!isExternalOnlyOccupied(slot)) return ''
    const cell = externalCellFor(slot)
    if (!cell) return ''
    const labels = (cell.sourceDetails || [])
      .filter((detail) => detail.source !== 'inbox')
      .map((detail) => detail.siteLabel)
    if (labels.length) return labels.join(' + ')
    return cell.badge || ''
  }

  function externalSourceDetails(slot: {
    courtId: string
    startTime: string
  } | null | undefined): OwnerExternalSourceDetail[] {
    const cell = externalCellFor(slot)
    if (!cell) return []
    return (cell.sourceDetails || []).filter((detail) => detail.source !== 'inbox')
  }

  function externalOwnerNote(slot: {
    courtId: string
    startTime: string
  } | null | undefined): string {
    const cell = externalCellFor(slot)
    return cell?.ownerNote?.trim() || ''
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
    externalSiteBadge,
    externalSourceDetails,
    externalOwnerNote,
    refreshExternalOverlay: refreshIfEnabled,
  }
}
