import { formatGuestDisplayName, normalizeGuestNamePair } from '#shared/guestName.ts'

export type GuestSearchHit = { name: string; mobile: string; source: 'user' | 'contact' | 'booking' }

type GuestSearchFields = {
  guestName: MaybeRef<string>
  guestFamily: MaybeRef<string>
  guestMobile: MaybeRef<string>
}

function setField(target: MaybeRef<string>, value: string) {
  if (isRef(target)) target.value = value
}

export function useOwnerGuestSearch(fields: GuestSearchFields) {
  const guestSuggestions = ref<GuestSearchHit[]>([])
  const guestSearchOpen = ref(false)
  const guestSearchPending = ref(false)
  const guestSearchSource = ref<'name' | 'mobile'>('name')

  let guestSearchTimer: ReturnType<typeof setTimeout> | null = null
  let guestSearchRequest = 0

  function clearGuestSearch() {
    if (guestSearchTimer) {
      clearTimeout(guestSearchTimer)
      guestSearchTimer = null
    }
    guestSuggestions.value = []
    guestSearchOpen.value = false
    guestSearchPending.value = false
  }

  async function runGuestSearch(raw: string) {
    const q = raw.trim()
    if (q.length < 2) {
      guestSuggestions.value = []
      guestSearchOpen.value = false
      guestSearchPending.value = false
      return
    }
    const requestId = ++guestSearchRequest
    guestSearchPending.value = true
    guestSearchOpen.value = true
    try {
      const res = await $fetch<{ guests: GuestSearchHit[] }>('/api/owner/guests/search', {
        query: { q },
      })
      if (requestId !== guestSearchRequest) return
      guestSuggestions.value = res.guests || []
    } catch {
      if (requestId !== guestSearchRequest) return
      guestSuggestions.value = []
    } finally {
      if (requestId === guestSearchRequest) {
        guestSearchPending.value = false
        guestSearchOpen.value = guestSuggestions.value.length > 0
      }
    }
  }

  function scheduleGuestSearch(raw: string) {
    if (guestSearchTimer) clearTimeout(guestSearchTimer)
    guestSearchTimer = setTimeout(() => {
      void runGuestSearch(raw)
    }, 250)
  }

  function onGuestNameFieldInput() {
    guestSearchSource.value = 'name'
    scheduleGuestSearch(formatGuestDisplayName(toValue(fields.guestName), toValue(fields.guestFamily)))
  }

  function onGuestMobileInput() {
    guestSearchSource.value = 'mobile'
    scheduleGuestSearch(toValue(fields.guestMobile))
  }

  function selectGuestSuggestion(guest: GuestSearchHit) {
    const parts = normalizeGuestNamePair(guest.name, '')
    setField(fields.guestName, parts.guestName)
    setField(fields.guestFamily, parts.guestFamily)
    if (guest.mobile) setField(fields.guestMobile, guest.mobile)
    clearGuestSearch()
  }

  function closeGuestSearchSoon() {
    setTimeout(() => {
      guestSearchOpen.value = false
    }, 150)
  }

  onBeforeUnmount(() => clearGuestSearch())

  return {
    guestSuggestions,
    guestSearchOpen,
    guestSearchPending,
    guestSearchSource,
    onGuestNameFieldInput,
    onGuestMobileInput,
    selectGuestSuggestion,
    closeGuestSearchSoon,
    clearGuestSearch,
  }
}
