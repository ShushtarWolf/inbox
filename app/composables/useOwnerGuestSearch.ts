import { guestSearchHitToFormPair, type GuestSearchHit } from '#shared/guestSearch.ts'

export type { GuestSearchHit }

type GuestSearchFields = {
  guestName: MaybeRef<string>
  guestFamily: MaybeRef<string>
  guestMobile: MaybeRef<string>
  guestNameInput?: Ref<HTMLInputElement | null>
  guestFamilyInput?: Ref<HTMLInputElement | null>
  guestMobileInput?: Ref<HTMLInputElement | null>
}

function setField(target: MaybeRef<string>, value: string) {
  if (isRef(target)) target.value = value
}

export function useOwnerGuestSearch(fields: GuestSearchFields) {
  const guestSuggestions = ref<GuestSearchHit[]>([])
  const guestSearchOpen = ref(false)
  const guestSearchPending = ref(false)
  const guestSearchSource = ref<'name' | 'family' | 'mobile'>('name')

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

  async function runGuestSearch(raw: string, field: 'name' | 'family' | 'mobile') {
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
        query: { q, field },
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

  function scheduleGuestSearch(raw: string, field: 'name' | 'family' | 'mobile') {
    if (guestSearchTimer) clearTimeout(guestSearchTimer)
    guestSearchTimer = setTimeout(() => {
      void runGuestSearch(raw, field)
    }, 250)
  }

  function onGuestNameFieldInput() {
    guestSearchSource.value = 'name'
    scheduleGuestSearch(toValue(fields.guestName).trim(), 'name')
  }

  function onGuestFamilyFieldInput() {
    guestSearchSource.value = 'family'
    scheduleGuestSearch(toValue(fields.guestFamily).trim(), 'family')
  }

  function onGuestMobileInput() {
    guestSearchSource.value = 'mobile'
    scheduleGuestSearch(toValue(fields.guestMobile), 'mobile')
  }

  function syncGuestInputsFromModel() {
    if (!import.meta.client) return
    nextTick(() => {
      const nameEl = fields.guestNameInput?.value
      const familyEl = fields.guestFamilyInput?.value
      const mobileEl = fields.guestMobileInput?.value
      if (nameEl) nameEl.value = toValue(fields.guestName)
      if (familyEl) familyEl.value = toValue(fields.guestFamily)
      if (mobileEl) mobileEl.value = toValue(fields.guestMobile)
    })
  }

  function selectGuestSuggestion(guest: GuestSearchHit) {
    const parts = guestSearchHitToFormPair(guest)
    setField(fields.guestName, parts.guestName)
    setField(fields.guestFamily, parts.guestFamily)
    if (guest.mobile) setField(fields.guestMobile, guest.mobile)
    clearGuestSearch()
    syncGuestInputsFromModel()
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
    onGuestFamilyFieldInput,
    onGuestMobileInput,
    selectGuestSuggestion,
    closeGuestSearchSoon,
    clearGuestSearch,
  }
}
