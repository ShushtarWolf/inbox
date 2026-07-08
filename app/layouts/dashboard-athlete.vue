<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const nav = computed(() => [
  { to: localePath('/athlete'), label: t('nav.overview'), icon: '📋' },
  { to: localePath('/athlete/bookings'), label: t('nav.bookings'), icon: '🎟️' },
  { to: localePath('/athlete/profile'), label: t('nav.profile'), icon: '👤' },
])
</script>

<template>
  <DashboardShell :title="t('dashboard.athlete')" :items="nav">
    <slot />
  </DashboardShell>
</template>
