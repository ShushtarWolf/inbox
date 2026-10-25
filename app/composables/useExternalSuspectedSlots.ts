type PublicSuspectedSlot = {
  slotId?: string
  startTime: string
  courtId: string
  suspected: true
}

type PublicSuspectedResponse = {
  suspected: PublicSuspectedSlot[]
  /** UNKNOWN/STALE with no confident FREE — non-bookable for guests. */
  uncertain?: Array<{ slotId?: string; startTime: string; courtId: string }>
}

/** Optional hook for athlete club calendar — no-ops when external calendar module is not registered. */
export function useExternalSuspectedSlots(opts: {
  clubSlug: MaybeRefOrGetter<string>
  date: MaybeRefOrGetter<string>
}) {
  const config = useRuntimeConfig()
  const enabled = computed(() => Boolean(config.public.externalCalendarModule))

  const fetchUrl = computed(() => (
    enabled.value ? '/api/public/external-suspected' : null
  ))

  const { data, refresh, pending } = useFetch<PublicSuspectedResponse>(fetchUrl, {
    query: computed(() => ({
      club: toValue(opts.clubSlug),
      date: toValue(opts.date),
    })),
    server: false,
    immediate: false,
    watch: false,
  })

  watch([fetchUrl, () => toValue(opts.clubSlug), () => toValue(opts.date)], () => {
    if (fetchUrl.value) refresh()
  }, { immediate: true })

  const suspectedKeys = computed(() => {
    const keys = new Set<string>()
    for (const item of data.value?.suspected || []) {
      const time = item.startTime.slice(0, 5)
      keys.add(`${item.courtId}:${time}`)
      if (item.slotId) keys.add(`id:${item.slotId}`)
    }
    return keys
  })

  const uncertainKeys = computed(() => {
    const keys = new Set<string>()
    for (const item of data.value?.uncertain || []) {
      keys.add(`${item.courtId}:${item.startTime.slice(0, 5)}`)
      if (item.slotId) keys.add(`id:${item.slotId}`)
    }
    return keys
  })

  /** Guest UI: external status uncertain → show «وضعیت نامشخص», not bookable. */
  function isSlotUncertain(slot: {
    id: string
    startTime?: string
    courtId?: string
    court?: { id?: string }
  }): boolean {
    if (!enabled.value) return false
    const courtId = slot.courtId || slot.court?.id || ''
    const time = (slot.startTime || '').slice(0, 5)
    return uncertainKeys.value.has(`${courtId}:${time}`) || uncertainKeys.value.has(`id:${slot.id}`)
  }

  function isSlotSuspected(slot: {
    id: string
    startTime?: string
    courtId?: string
    court?: { id?: string }
  }): boolean {
    if (!enabled.value) return false
    const courtId = slot.courtId || slot.court?.id || ''
    const time = (slot.startTime || '').slice(0, 5)
    return suspectedKeys.value.has(`${courtId}:${time}`) || suspectedKeys.value.has(`id:${slot.id}`)
  }

  return {
    enabled,
    isSlotSuspected,
    isSlotUncertain,
    refreshSuspected: refresh,
    suspectedPending: pending,
  }
}
