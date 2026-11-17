import { guestSearchHitToFormPair, type GuestSearchHit } from '#shared/guestSearch.ts'
import { applyGuestDeskInputsFromModel } from '#shared/ownerDeskGuestForm.ts'

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
  let guestInputSuppressUntil = 0

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
    if (Date.now() < guestInputSuppressUntil) return
    guestSearchSource.value = 'name'
    scheduleGuestSearch(toValue(fields.guestName).trim(), 'name')
  }

  function onGuestFamilyFieldInput() {
    if (Date.now() < guestInputSuppressUntil) return
    guestSearchSource.value = 'family'
    scheduleGuestSearch(toValue(fields.guestFamily).trim(), 'family')
  }

  function onGuestMobileInput() {
    if (Date.now() < guestInputSuppressUntil) return
    guestSearchSource.value = 'mobile'
    scheduleGuestSearch(toValue(fields.guestMobile), 'mobile')
  }

  function syncGuestInputsFromModel() {
    if (!import.meta.client) return
    applyGuestDeskInputsFromModel(
      {
        guestName: toValue(fields.guestName),
        guestFamily: toValue(fields.guestFamily),
        guestMobile: toValue(fields.guestMobile),
      },
      {
        guestName: fields.guestNameInput?.value,
        guestFamily: fields.guestFamilyInput?.value,
        guestMobile: fields.guestMobileInput?.value,
      },
    )
  }

  function paintGuestInputsAfterSelect() {
    syncGuestInputsFromModel()
    nextTick(() => {
      syncGuestInputsFromModel()
      if (import.meta.client) requestAnimationFrame(() => syncGuestInputsFromModel())
    })
  }

  function selectGuestSuggestion(guest: GuestSearchHit) {
    guestSearchRequest += 1
    guestInputSuppressUntil = Date.now() + 450
    const parts = guestSearchHitToFormPair(guest)
    setField(fields.guestName, parts.guestName)
    setField(fields.guestFamily, parts.guestFamily)
    if (guest.mobile) setField(fields.guestMobile, guest.mobile)
    clearGuestSearch()
    paintGuestInputsAfterSelect()
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
