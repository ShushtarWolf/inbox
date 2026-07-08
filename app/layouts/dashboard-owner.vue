<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { user, fetch: fetchAuth } = useAuth()
const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })
const nav = computed(() => [
  { to: localePath('/owner'), label: t('owner.calendar'), icon: '📅' },
  { to: localePath('/owner/finance'), label: t('owner.finance'), icon: '💳' },
  { to: localePath('/owner/equipments'), label: t('owner.equipments'), icon: '🎾' },
  { to: localePath('/owner/packages'), label: t('owner.packages'), icon: '📦' },
  { to: localePath('/owner/crm'), label: t('owner.crm'), icon: '📇' },
  { to: localePath('/owner/coaches'), label: t('owner.coaches'), icon: '👥' },
  { to: localePath('/owner/support'), label: t('owner.support'), icon: '🛟' },
  { to: localePath('/owner/settings'), label: t('owner.settings'), icon: '⚙️' },
])

const memberships = computed(() => user.value?.memberships || [])

watchEffect(() => {
  if (!selectedClubId.value && memberships.value.length) {
    const primary = memberships.value.find((item) => item.isPrimary) || memberships.value[0]
    selectedClubId.value = primary?.club.id || null
  }
})

onMounted(() => fetchAuth())
</script>

<template>
  <DashboardShell :title="t('dashboard.owner')" :items="nav" :wide="true" :dark-nav="true">
    <div v-if="memberships.length > 1" class="mb-4 flex items-center justify-end gap-2">
      <label class="text-xs font-bold text-brand-gray-600">{{ t('owner.activeClub') }}</label>
      <select v-model="selectedClubId" class="rounded-xl border px-3 py-2 text-sm">
        <option v-for="item in memberships" :key="item.club.id" :value="item.club.id">
          {{ item.club.nameFa }} / {{ item.club.nameEn }}
        </option>
      </select>
    </div>
    <slot />
  </DashboardShell>
</template>
