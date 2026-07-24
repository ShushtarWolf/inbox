<script setup lang="ts">
import { canAccessOwnerNav, parsePermissions } from '#shared/ownerPermissions.ts'
import { isRecurringReserveEnabled } from '#shared/recurringReserve.ts'

const { t } = useI18n()
const localePath = useLocalePath()
const { user, fetch: fetchAuth } = useAuth()
const { localizedField } = useLocalizedField()
const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })
const ownerClubVersion = ref(0)

provide('ownerClubVersion', ownerClubVersion)

/** Primary Canva bottom-nav tabs (mobile-first). Extra destinations live on /owner home. */
const primaryNavItems = [
  { path: '/owner/calendar', labelKey: 'owner.calendarShort', icon: 'calendar_month' },
  { path: '/owner/finance', labelKey: 'owner.finance', icon: 'payments' },
  { path: '/owner/settings', labelKey: 'owner.settings', icon: 'settings' },
  { path: '/owner', labelKey: 'owner.more', icon: 'apps' },
] as const

const activeMembership = computed(() => {
  const memberships = user.value?.memberships || []
  return memberships.find((m) => m.club.id === selectedClubId.value) || memberships[0]
})

function filterNav<T extends { path: string }>(items: readonly T[]) {
  const membership = activeMembership.value
  const role = membership?.role
  const permissions = parsePermissions(membership?.permissionsJson)
  const isOwner = role === 'OWNER'
  const { pilotNoCoach } = usePilotFlags()
  const coachCount = membership?.club?._count?.coaches ?? 0

  return items.filter((item) => {
    if (item.path === '/owner') return true
    if (item.path === '/owner/workers' && !isOwner) return false
    if (item.path === '/owner/coaches' && (pilotNoCoach.value || coachCount === 0)) return false
    if (item.path === '/owner/packages' && !isRecurringReserveEnabled()) return false
    return canAccessOwnerNav(item.path, permissions, isOwner)
  })
}

const bottomNav = computed(() =>
  filterNav(primaryNavItems).map((item) => ({
    to: localePath(item.path),
    label: t(item.labelKey),
    icon: item.icon,
  })),
)

const memberships = computed(() => user.value?.memberships || [])

watchEffect(() => {
  if (!selectedClubId.value && memberships.value.length) {
    const primary = memberships.value.find((item) => item.isPrimary) || memberships.value[0]
    selectedClubId.value = primary?.club.id || null
  }
})

watch(selectedClubId, () => {
  ownerClubVersion.value += 1
})

onMounted(() => fetchAuth())
</script>

<template>
  <DashboardShell
    :title="t('dashboard.owner')"
    :items="bottomNav"
    :wide="true"
    :dark-nav="false"
    hide-mobile-header
    phone-shell
  >
    <div v-if="memberships.length > 1" class="canva-club-switcher">
      <span class="venus-icon-wrap venus-icon-wrap-sm bg-brand-primary-soft text-brand-primary">
        <AppIcon name="apartment" size="sm" />
      </span>
      <label class="flex min-w-0 flex-1 flex-col gap-1 text-xs font-bold text-brand-gray-600">
        <span>{{ t('owner.activeClub') }}</span>
        <select v-model="selectedClubId" class="neo-select">
          <option v-for="item in memberships" :key="item.club.id" :value="item.club.id">
            {{ localizedField(item.club, 'nameFa', 'nameEn') }}
          </option>
        </select>
      </label>
    </div>
    <slot />
  </DashboardShell>
</template>
