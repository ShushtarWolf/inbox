<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()

/** Canva hub bottom nav — favorites page is OUT OF MVP (hide, do not build). */
const nav = computed(() => [
  { to: localePath('/athlete/home'), label: t('nav.home'), icon: 'home' },
  { to: localePath('/athlete/bookings'), label: t('nav.myBookings'), icon: 'confirmation_number' },
  { to: localePath('/athlete'), label: t('nav.profile'), icon: 'person' },
])

/** Desktop/sidebar: primary tabs + same account links as athlete hub menu. */
const sideNav = computed(() => [
  ...nav.value,
  { to: localePath('/athlete/profile'), label: t('athlete.editProfile'), icon: 'manage_accounts' },
  { to: localePath('/athlete/wallet'), label: t('nav.wallet'), icon: 'account_balance_wallet' },
  { to: localePath('/athlete/payments'), label: t('athlete.paymentMethods'), icon: 'credit_card' },
  { to: localePath('/athlete/notifications'), label: t('nav.notifications'), icon: 'notifications' },
  { to: localePath('/contact'), label: t('athlete.support'), icon: 'support_agent' },
  { to: localePath('/privacy'), label: t('legal.privacy'), icon: 'privacy_tip' },
])
</script>

<template>
  <DashboardShell
    :title="t('dashboard.athlete')"
    :items="nav"
    :side-items="sideNav"
    :wide="true"
    :dark-nav="false"
    hide-mobile-header
    phone-shell
    hide-user
  >
    <slot />
  </DashboardShell>
</template>
