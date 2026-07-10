<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { data: notifications } = await useAuthedFetch('/api/notifications', { lazy: true })
const unread = computed(() => notifications.value?.unreadCount || 0)

const nav = computed(() => [
  { to: localePath('/athlete'), label: t('nav.overview'), icon: '📋' },
  { to: localePath('/athlete/bookings'), label: t('nav.bookings'), icon: '🎟️', badge: unread.value || undefined },
  { to: localePath('/athlete/profile'), label: t('nav.profile'), icon: '👤' },
])
</script>

<template>
  <DashboardShell :title="t('dashboard.athlete')" :items="nav">
    <slot />
  </DashboardShell>
</template>
