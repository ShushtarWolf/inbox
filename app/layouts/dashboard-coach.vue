<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const nav = computed(() => [
  { to: localePath('/coach'), label: t('coach.today'), icon: '📅' },
  { to: localePath('/coach/schedule'), label: t('coach.schedule'), icon: '🕒' },
  { to: localePath('/coach/clients'), label: t('coach.clients'), icon: '👥' },
  { to: localePath('/coach/profile'), label: t('nav.profile'), icon: '👤' },
])
</script>

<template>
  <DashboardShell :title="t('dashboard.coach')" :items="nav">
    <slot />
  </DashboardShell>
</template>
