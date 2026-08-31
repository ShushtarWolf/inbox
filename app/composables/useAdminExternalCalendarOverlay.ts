type AdminExternalSourceDetail = {
  source: string
  siteLabel: string
  externalClubTitle: string | null
}

type AdminExternalCell = {
  courtId: string
  startTime: string
  inboxStatus: string
  sources: string[]
  badge: string
  occupied: boolean
  sourceDetails?: AdminExternalSourceDetail[]
}

type AdminExternalCalendarPayload = {
  date: string
  mapped: boolean
  cells: AdminExternalCell[]
  pollIntervalMs?: number
}

function occupancyKey(courtId: string, startTime: string) {
  return `${courtId}:${startTime.slice(0, 5)}`
}

/**
 * Optional overlay for admin mother calendar — no-ops when external calendar module is absent.
 * Shows AloPlay / AloVarzesh site names on FREE inbox cells occupied externally.
 */
export function useAdminExternalCalendarOverlay(opts: {
  clubSlug: MaybeRefOrGetter<string>
  date: MaybeRefOrGetter<string>
  secret: MaybeRefOrGetter<string>
  adminFetch: (url: string) => Promise<unknown>
}) {
  const config = useRuntimeConfig()
  const { t } = useI18n()
  const enabled = computed(() => Boolean(config.public.externalCalendarModule))

  const data = ref<AdminExternalCalendarPayload | null>(null)
  const pending = ref(false)
  const error = ref('')

  async function refreshIfEnabled() {
    const slug = toValue(opts.clubSlug)?.trim()
    const date = toValue(opts.date)
    const secret = toValue(opts.secret)?.trim()
    if (!enabled.value || !slug || !secret) {
      data.value = null
      error.value = ''
      pending.value = false
      return
    }
    pending.value = true
    error.value = ''
    try {
      data.value = await opts.adminFetch(
        `/api/admin/calendar-sources?clubSlug=${encodeURIComponent(slug)}&date=${encodeURIComponent(date)}`,
      ) as AdminExternalCalendarPayload
    } catch (err: unknown) {
      data.value = null
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 403) {
        error.value = t('admin.invalidSecret')
      } else {
        error.value = t('admin.calendarOverlayError')
      }
    } finally {
      pending.value = false
    }
  }

  watch(
    [enabled, () => toValue(opts.clubSlug), () => toValue(opts.date), () => toValue(opts.secret)],
    () => {
      void refreshIfEnabled()
    },
    { immediate: true },
  )

  const cellByKey = computed(() => {
    const map = new Map<string, AdminExternalCell>()
    for (const cell of data.value?.cells || []) {
      map.set(occupancyKey(cell.courtId, cell.startTime), cell)
    }
    return map
  })

  function externalCellFor(slot: { courtId: string; startTime: string } | null | undefined) {
    if (!enabled.value || !slot) return null
    return cellByKey.value.get(occupancyKey(slot.courtId, slot.startTime)) || null
  }

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

  function externalSiteLabels(slot: {
    courtId: string
    startTime: string
    displayStatus?: string
  } | null | undefined): string[] {
    if (!isExternalOnlyOccupied(slot)) return []
    const cell = externalCellFor(slot)
    if (!cell) return []
    const labels = (cell.sourceDetails || [])
      .filter((detail) => detail.source !== 'inbox')
      .map((detail) => detail.siteLabel)
      .filter(Boolean)
    if (labels.length) return labels
    if (!cell.badge) return []
    return cell.badge.split(' + ').filter((label) => label && label !== 'اینباکس')
  }

  function externalSiteBadge(slot: {
    courtId: string
    startTime: string
    displayStatus?: string
  } | null | undefined): string {
    return externalSiteLabels(slot).join(' + ')
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
    externalOverlayError: error,
    isExternalOnlyOccupied,
    externalSiteLabels,
    externalSiteBadge,
    refreshExternalOverlay: refreshIfEnabled,
  }
}
