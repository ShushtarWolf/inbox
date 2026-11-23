/**
 * Keep owner club status in useAuth() fresh after admin approval without a full re-login.
 * Profile is cached in useState; the owner layout only mounted fetchAuth once before this.
 */
export function useOwnerMembershipRefresh() {
  const route = useRoute()
  const { user, fetch: fetchAuth } = useAuth()

  const shouldPollMemberships = computed(() => {
    const memberships = user.value?.memberships || []
    return memberships.some(
      (m) => m.club.status === 'PENDING' || m.club.status === 'SUSPENDED',
    )
  })

  let inflight: Promise<void> | null = null
  async function refreshMemberships() {
    if (!shouldPollMemberships.value) return
    if (inflight) return inflight
    inflight = fetchAuth().finally(() => {
      inflight = null
    })
    return inflight
  }

  onMounted(() => {
    void refreshMemberships()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refreshMemberships()
    }
    document.addEventListener('visibilitychange', onVisibility)
    onUnmounted(() => document.removeEventListener('visibilitychange', onVisibility))
  })

  watch(() => route.fullPath, () => {
    void refreshMemberships()
  })
}