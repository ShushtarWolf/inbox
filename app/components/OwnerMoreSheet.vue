<script setup lang="ts">
import { canAccessOwnerNav, parsePermissions } from '#shared/ownerPermissions.ts'
import { isRecurringReserveEnabled } from '#shared/recurringReserve.ts'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const localePath = useLocalePath()
const { user } = useAuth()
const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })
const { pilotNoCoach } = usePilotFlags()

const activeMembership = computed(() => {
  const memberships = user.value?.memberships || []
  return memberships.find((m) => m.club.id === selectedClubId.value) || memberships[0]
})

const tiles = computed(() => {
  const membership = activeMembership.value
  const role = membership?.role
  const permissions = parsePermissions(membership?.permissionsJson)
  const isOwner = role === 'OWNER'
  const coachCount = membership?.club?._count?.coaches ?? 0

  const items = [
    { path: '/owner/coaches', labelKey: 'owner.coaches', icon: 'diversity_3' },
    { path: '/owner/crm', labelKey: 'owner.crm', icon: 'groups' },
    { path: '/owner/packages', labelKey: 'owner.packages', icon: 'package_2' },
    { path: '/owner/equipments', labelKey: 'owner.equipments', icon: 'inventory_2' },
    { path: '/owner/support', labelKey: 'owner.support', icon: 'support_agent' },
    { path: '/owner/workers', labelKey: 'owner.workers', icon: 'badge' },
  ] as const

  return items
    .filter((item) => {
      if (item.path === '/owner/workers' && !isOwner) return false
      if (item.path === '/owner/coaches' && (pilotNoCoach.value || coachCount === 0)) return false
      if (item.path === '/owner/packages' && !isRecurringReserveEnabled()) return false
      return canAccessOwnerNav(item.path, permissions, isOwner)
    })
    .map((item) => ({
      to: localePath(item.path),
      label: t(item.labelKey),
      icon: item.icon,
    }))
})

function onNavigate() {
  emit('close')
}
</script>

<template>
  <AppModal :open="props.open" :title="t('owner.more')" sheet patterned max-width-class="canva-phone-shell" @close="emit('close')">
    <div class="canva-more-grid">
      <NuxtLink
        v-for="tile in tiles"
        :key="tile.to"
        :to="tile.to"
        class="canva-more-tile"
        @click="onNavigate"
      >
        <span class="canva-more-tile-icon">
          <AppIcon :name="tile.icon" size="sm" />
        </span>
        <span>{{ tile.label }}</span>
      </NuxtLink>
    </div>
  </AppModal>
</template>
