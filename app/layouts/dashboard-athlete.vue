<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()

/** Canva hub bottom nav — favorites page is OUT OF MVP (hide, do not build). */
const nav = computed(() => [
  { to: localePath('/athlete/home'), label: t('nav.home'), icon: 'home' },
  { to: localePath('/athlete/bookings'), label: t('nav.myBookings'), icon: 'confirmation_number' },
  { to: localePath('/athlete'), label: t('nav.profile'), icon: 'person' },
])
</script>

<template>
  <DashboardShell
    :title="t('dashboard.athlete')"
    :items="nav"
    :dark-nav="false"
    hide-mobile-header
    phone-shell
    hide-user
  >
    <slot />
  </DashboardShell>
</template>
