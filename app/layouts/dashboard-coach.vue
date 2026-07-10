<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const nav = computed(() => [
  { to: localePath('/coach'), label: t('coach.today'), icon: 'today' },
  { to: localePath('/coach/schedule'), label: t('coach.schedule'), icon: 'schedule' },
  { to: localePath('/coach/clients'), label: t('coach.clients'), icon: 'groups' },
  { to: localePath('/coach/profile'), label: t('nav.profile'), icon: 'person' },
])
</script>

<template>
  <DashboardShell :title="t('dashboard.coach')" :items="nav">
    <slot />
  </DashboardShell>
</template>
