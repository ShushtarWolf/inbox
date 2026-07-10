<script setup lang="ts">
import { hasOwnerPermission, OWNER_NAV_PERMISSIONS, parsePermissions } from '#shared/ownerPermissions.ts'

const { t } = useI18n()
const localePath = useLocalePath()
const { user, fetch: fetchAuth } = useAuth()
const { localizedField } = useLocalizedField()
const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })
const ownerClubVersion = ref(0)

provide('ownerClubVersion', ownerClubVersion)

const allNavItems = [
  { path: '/owner', labelKey: 'owner.calendar', icon: '📅' },
  { path: '/owner/finance', labelKey: 'owner.finance', icon: '💳' },
  { path: '/owner/equipments', labelKey: 'owner.equipments', icon: '🎾' },
  { path: '/owner/packages', labelKey: 'owner.packages', icon: '📦' },
  { path: '/owner/crm', labelKey: 'owner.crm', icon: '📇' },
  { path: '/owner/coaches', labelKey: 'owner.coaches', icon: '👥' },
  { path: '/owner/support', labelKey: 'owner.support', icon: '🛟' },
  { path: '/owner/settings', labelKey: 'owner.settings', icon: '⚙️' },
] as const

const activeMembership = computed(() => {
  const memberships = user.value?.memberships || []
  return memberships.find((m) => m.club.id === selectedClubId.value) || memberships[0]
})

const nav = computed(() => {
  const membership = activeMembership.value
  const role = membership?.role
  const permissions = parsePermissions(membership?.permissionsJson)
  const isOwner = role === 'OWNER'

  return allNavItems
    .filter((item) => {
      const perm = OWNER_NAV_PERMISSIONS[item.path]
      if (!perm) return true
      if (isOwner) return true
      return hasOwnerPermission(permissions, perm)
    })
    .map((item) => ({
      to: localePath(item.path),
      label: t(item.labelKey),
      icon: item.icon,
    }))
})

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
  <DashboardShell :title="t('dashboard.owner')" :items="nav" :wide="true" :dark-nav="true">
    <div v-if="memberships.length > 1" class="mb-4 flex items-center justify-end gap-2 rtl:justify-start">
      <label class="flex items-center gap-2 text-xs font-bold text-brand-gray-600">
        <span>{{ t('owner.activeClub') }}</span>
        <select v-model="selectedClubId" class="rounded-xl border px-3 py-2 text-sm">
          <option v-for="item in memberships" :key="item.club.id" :value="item.club.id">
            {{ localizedField(item.club, 'nameFa', 'nameEn') }}
          </option>
        </select>
      </label>
    </div>
    <slot />
  </DashboardShell>
</template>
