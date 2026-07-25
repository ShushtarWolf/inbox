/** Public SMS phase probe for honest product claims (no secrets). */
export function useSmsCapability() {
  const { data, pending, error, refresh } = useFetch<{
    ok?: boolean
    smsPhase?: 'SINGLE' | 'MULTI'
    multiReady?: boolean
    smsMode?: 'log' | 'live'
    resolvedProvider?: 'log' | 'live'
  }>('/api/auth/sms-capability', { lazy: true })

  const smsPhase = computed<'SINGLE' | 'MULTI'>(() =>
    data.value?.smsPhase === 'MULTI' ? 'MULTI' : 'SINGLE',
  )

  const multiReady = computed(() =>
    Boolean(data.value?.multiReady) || smsPhase.value === 'MULTI',
  )

  return { data, pending, error, refresh, smsPhase, multiReady }
}
