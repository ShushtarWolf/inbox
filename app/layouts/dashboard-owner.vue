<script setup lang="ts">
import type { NavItem } from '#shared/nav.ts'
import { canAccessOwnerNav, parsePermissions } from '#shared/ownerPermissions.ts'

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const { user, fetch: fetchAuth } = useAuth()
const { localizedField } = useLocalizedField()
const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })
const ownerClubVersion = ref(0)
const moreOpen = ref(false)

provide('ownerClubVersion', ownerClubVersion)
provide('ownerMoreOpen', moreOpen)

/** Primary Canva bottom-nav tabs. «بیشتر» opens a sheet grid (not /owner hub). */
const primaryNavItems = [
  { path: '/owner/calendar', labelKey: 'owner.calendarShort', icon: 'calendar_month' },
  { path: '/owner/finance', labelKey: 'owner.finance', icon: 'attach_money' },
  { path: '/owner/settings', labelKey: 'owner.settings', icon: 'person' },
] as const

const desktopExtraNavItems = [
  { path: '/owner/crm', labelKey: 'owner.crm', icon: 'shield_person' },
  { path: '/owner/equipments', labelKey: 'owner.equipments', icon: 'campaign' },
  { path: '/owner/support', labelKey: 'owner.support', icon: 'headset_mic' },
  { path: '/owner/workers', labelKey: 'owner.workers', icon: 'badge' },
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

  return items.filter((item) => {
    if (item.path === '/owner/workers' && !isOwner) return false
    // Court MVP: never surface Coaches / Packages (routes stay stubbed/pilot-gated).
    if (item.path === '/owner/coaches' || item.path === '/owner/packages') return false
    return canAccessOwnerNav(item.path, permissions, isOwner)
  })
}

const bottomNav = computed((): NavItem[] => {
  const items: NavItem[] = filterNav(primaryNavItems).map((item) => ({
    to: localePath(item.path),
    label: t(item.labelKey),
    icon: item.icon,
  }))
  items.push({
    to: '#more',
    label: t('owner.more'),
    icon: 'more_horiz',
    action: () => { moreOpen.value = true },
  })
  return items
})

const sideNav = computed((): NavItem[] => [
  ...filterNav(primaryNavItems).map((item) => ({
    to: localePath(item.path),
    label: t(item.labelKey),
    icon: item.icon,
  })),
  ...filterNav(desktopExtraNavItems).map((item) => ({
    to: localePath(item.path),
    label: t(item.labelKey),
    icon: item.icon,
  })),
])

const memberships = computed(() => user.value?.memberships || [])

/** Club switcher white card must not sit above photo-hero pages (Canva). */
const showLayoutClubSwitcher = computed(
  () => memberships.value.length > 1
    && !route.path.includes('/owner/calendar')
    && !route.path.includes('/owner/finance'),
)

watchEffect(() => {
  if (!selectedClubId.value && memberships.value.length) {
    const primary = memberships.value.find((item) => item.isPrimary) || memberships.value[0]
    selectedClubId.value = primary?.club.id || null
  }
})

watch(selectedClubId, () => {
  ownerClubVersion.value += 1
})

watch(() => route.query.more, (value) => {
  if (value === '1' || value === 'true') moreOpen.value = true
}, { immediate: true })

function closeMore() {
  moreOpen.value = false
  if (route.query.more) {
    const query = { ...route.query }
    delete query.more
    router.replace({ path: route.path, query })
  }
}

onMounted(() => fetchAuth())
</script>

<template>
  <DashboardShell
    :title="t('dashboard.owner')"
    :items="bottomNav"
    :side-items="sideNav"
    :wide="true"
    :dark-nav="false"
    hide-mobile-header
    phone-shell
  >
    <div v-if="showLayoutClubSwitcher" class="canva-club-switcher">
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
    <OwnerMoreSheet :open="moreOpen" @close="closeMore" />
  </DashboardShell>
</template>
