<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { fetch: fetchAuth } = useAuth()
const { packagesEnabled } = usePilotFlags()

onMounted(() => {
  fetchAuth()
})

const nav = computed(() => {
  const items = [
    { to: localePath('/coach'), label: t('coach.today'), icon: 'today' },
    { to: localePath('/coach/schedule'), label: t('coach.schedule'), icon: 'schedule' },
    { to: localePath('/coach/book'), label: t('coach.book.navLabel'), icon: 'add_circle' },
    { to: localePath('/coach/clients'), label: t('coach.clients'), icon: 'groups' },
  ]
  if (packagesEnabled.value) {
    items.push({ to: localePath('/coach/packages'), label: t('owner.packages'), icon: 'inventory_2' })
  }
  items.push({ to: localePath('/coach/profile'), label: t('nav.profile'), icon: 'person' })
  return items
})
</script>

<template>
  <DashboardShell :title="t('dashboard.coach')" :items="nav" :dark-nav="true">
    <slot />
  </DashboardShell>
</template>
