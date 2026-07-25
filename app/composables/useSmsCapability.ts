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

  const smsMode = computed<'log' | 'live'>(() =>
    data.value?.smsMode === 'live' || data.value?.resolvedProvider === 'live' ? 'live' : 'log',
  )

  const smsLive = computed(() => smsMode.value === 'live' && smsPhase.value === 'MULTI')

  const multiReady = computed(() =>
    Boolean(data.value?.multiReady) || smsPhase.value === 'MULTI',
  )

  return { data, pending, error, refresh, smsPhase, smsMode, smsLive, multiReady }
}
