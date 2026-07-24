<script setup lang="ts">
import { canAccessOwnerNav, parsePermissions } from '#shared/ownerPermissions.ts'
import { isRecurringReserveEnabled } from '#shared/recurringReserve.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { displayName, avatarUrl, initials, firstName, user } = useAuth()
const { localizedField } = useLocalizedField()
const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })

const activeMembership = computed(() => {
  const memberships = user.value?.memberships || []
  return memberships.find((m) => m.club.id === selectedClubId.value) || memberships[0]
})

const clubLabel = computed(() => {
  const club = activeMembership.value?.club
  if (!club) return t('dashboard.owner')
  return localizedField(club, 'nameFa', 'nameEn')
})

const menu = computed(() => {
  const membership = activeMembership.value
  const role = membership?.role
  const permissions = parsePermissions(membership?.permissionsJson)
  const isOwner = role === 'OWNER'
  const { pilotNoCoach } = usePilotFlags()
  const coachCount = membership?.club?._count?.coaches ?? 0

  const items = [
    { path: '/owner/calendar', labelKey: 'owner.calendar', icon: 'calendar_month' },
    { path: '/owner/finance', labelKey: 'owner.finance', icon: 'payments' },
    { path: '/owner/crm', labelKey: 'owner.crm', icon: 'groups' },
    { path: '/owner/equipments', labelKey: 'owner.equipments', icon: 'inventory_2' },
    { path: '/owner/support', labelKey: 'owner.support', icon: 'support_agent' },
    { path: '/owner/settings', labelKey: 'owner.settings', icon: 'settings' },
    { path: '/owner/workers', labelKey: 'owner.workers', icon: 'badge' },
    { path: '/owner/packages', labelKey: 'owner.packages', icon: 'package_2' },
    { path: '/owner/coaches', labelKey: 'owner.coaches', icon: 'diversity_3' },
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
</script>

<template>
  <div class="venus-page-stack">
    <section class="canva-dash-hero">
      <div class="flex items-center gap-4">
        <div class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-white/40 bg-white/15 text-lg font-bold">
          <img v-if="avatarUrl" :src="avatarUrl" alt="" class="h-full w-full object-cover" />
          <span v-else>{{ initials }}</span>
        </div>
        <div class="min-w-0">
          <p class="text-xs text-white/80">{{ t('owner.dashboardEyebrow') }}</p>
          <h1 class="truncate text-xl font-bold">{{ displayName || firstName }}</h1>
          <p class="mt-0.5 truncate text-sm text-white/85">{{ clubLabel }}</p>
        </div>
      </div>
    </section>

    <div class="canva-dash-menu">
      <NuxtLink
        v-for="item in menu"
        :key="item.to"
        :to="item.to"
        class="canva-dash-menu-item"
      >
        <span class="venus-icon-wrap venus-icon-wrap-sm bg-brand-primary-soft text-brand-primary">
          <AppIcon :name="item.icon" size="sm" />
        </span>
        <span class="flex-1">{{ item.label }}</span>
        <AppIcon name="chevron_left" size="sm" class="text-brand-gray-400" />
      </NuxtLink>
    </div>
  </div>
</template>
