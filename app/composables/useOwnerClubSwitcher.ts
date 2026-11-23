import { pickDefaultOwnerClubId } from '#shared/ownerClubSelection.ts'

type OwnerMembershipRow = {
  isPrimary?: boolean
  club: { id: string; status?: string | null; nameFa?: string; nameEn?: string; slug?: string }
}

export function useOwnerClubSwitcher() {
  const { t } = useI18n()
  const { localizedField } = useLocalizedField()
  const localePath = useLocalePath()
  const { user, fetch: fetchAuth } = useAuth()
  const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })
  const switching = ref(false)
  const ownerClubVersion = inject<Ref<number> | null>('ownerClubVersion', null)

  const memberships = computed(() => (user.value?.memberships || []) as OwnerMembershipRow[])

  watch(
    memberships,
    (list) => {
      if (!list.length) return
      const next = pickDefaultOwnerClubId(list, selectedClubId.value)
      if (next && next !== selectedClubId.value && !selectedClubId.value) {
        selectedClubId.value = next
      } else if (next && selectedClubId.value && !list.some((m) => m.club.id === selectedClubId.value)) {
        selectedClubId.value = next
      }
    },
    { immediate: true },
  )

  const activeMembership = computed(() =>
    memberships.value.find((m) => m.club.id === selectedClubId.value) || memberships.value[0],
  )

  function clubStatusLabel(status?: string | null) {
    if (status === 'ACTIVE') return t('owner.clubStatusActive')
    if (status === 'PENDING') return t('owner.clubStatusPending')
    if (status === 'SUSPENDED') return t('owner.clubStatusSuspended')
    return ''
  }

  function clubOptionLabel(item: OwnerMembershipRow) {
    const name = localizedField(item.club, 'nameFa', 'nameEn')
    const status = clubStatusLabel(item.club.status)
    return status ? `${name} — ${status}` : name
  }

  async function switchClub(clubId: string) {
    if (!clubId || clubId === selectedClubId.value) return
    switching.value = true
    try {
      await $fetch('/api/owner/clubs/switch', { method: 'POST', body: { clubId } })
      selectedClubId.value = clubId
      await fetchAuth()
      if (ownerClubVersion) ownerClubVersion.value += 1
    } finally {
      switching.value = false
    }
  }

  async function onSelectChange(clubId: string) {
    await switchClub(clubId)
  }

  const addClubPath = computed(() => localePath('/owner/clubs/new'))

  return {
    memberships,
    selectedClubId,
    activeMembership,
    switching,
    showSwitcher: computed(() => memberships.value.length > 1),
    clubOptionLabel,
    clubStatusLabel,
    switchClub,
    onSelectChange,
    addClubPath,
  }
}