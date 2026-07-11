<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { data: notifications } = await useAuthedFetch('/api/notifications', { lazy: true })
const unread = computed(() => notifications.value?.unreadCount || 0)

const nav = computed(() => [
  { to: localePath('/athlete'), label: t('nav.overview'), icon: 'dashboard' },
  { to: localePath('/athlete/bookings'), label: t('nav.bookings'), icon: 'confirmation_number', badge: unread.value || undefined },
  { to: localePath('/athlete/profile'), label: t('nav.profile'), icon: 'person' },
])
</script>

<template>
  <DashboardShell :title="t('dashboard.athlete')" :items="nav" :dark-nav="true">
    <slot />
  </DashboardShell>
</template>
