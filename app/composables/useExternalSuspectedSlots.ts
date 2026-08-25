type PublicSuspectedSlot = {
  slotId?: string
  startTime: string
  courtId: string
  suspected: true
}

type PublicSuspectedResponse = {
  suspected: PublicSuspectedSlot[]
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
    refreshSuspected: refresh,
    suspectedPending: pending,
  }
}
