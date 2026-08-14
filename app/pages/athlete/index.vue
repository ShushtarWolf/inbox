<script setup lang="ts">
/** Canva p22 user hub: profile + stats + account list (not a booking overview). */
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const localePath = useLocalePath()
const { t } = useI18n()
const { displayName, avatarUrl, initials, firstName, user, logout, fetch: fetchAuth } = useAuth()
const { formatCurrency, formatNumber } = useFormatters()
const { smsLive } = useSmsCapability()
const { pilotNoCoach } = usePilotFlags()
const { data, pending } = useAuthedFetch('/api/bookings/mine')

onMounted(() => {
  if (!user.value) fetchAuth()
})

const phone = computed(() => user.value?.phone || '')

const addMobileHint = computed(() =>
  smsLive.value ? t('athlete.addMobileForSmsMulti') : t('athlete.addMobileForSmsSingle'),
)

const bookingCount = computed(() => {
  const courts = data.value?.courtBookings?.length || 0
  if (pilotNoCoach.value) return courts
  const coaches = data.value?.coachSessions?.length || 0
  const packages = data.value?.packageBookings?.length || 0
  return courts + coaches + packages
})

const spendTotal = computed(() => {
  const court = (data.value?.courtBookings || []).reduce((sum: number, b: { payment?: { amount?: number } | null; slot?: { price?: number } }) => {
    return sum + (b.payment?.amount || b.slot?.price || 0)
  }, 0)
  if (pilotNoCoach.value) return court
  const coach = (data.value?.coachSessions || []).reduce((sum: number, s: { payment?: { amount?: number } | null; price?: number }) => {
    return sum + (s.payment?.amount || s.price || 0)
  }, 0)
  const packages = (data.value?.packageBookings || []).reduce((sum: number, b: { payment?: { amount?: number } | null; package?: { price?: number } }) => {
    return sum + (b.payment?.amount || b.package?.price || 0)
  }, 0)
  return court + coach + packages
})

const spendDisplay = computed(() => {
  const amount = spendTotal.value
  if (amount >= 1_000_000) return formatNumber(Math.round((amount / 1_000_000) * 10) / 10)
  if (amount >= 1000) return formatNumber(Math.round(amount / 1000))
  return formatNumber(amount)
})

const spendUnit = computed(() => {
  if (spendTotal.value >= 1_000_000) return t('athlete.statSpendMillions')
  if (spendTotal.value >= 1000) return t('athlete.statSpendThousands')
  return t('athlete.statSpend')
})

/** Rating aggregate API does not exist yet — show em dash, never invent a score. */
const ratingDisplay = computed(() => '—')

const menu = computed(() => [
  { to: localePath('/athlete/profile'), label: t('athlete.editProfile'), icon: 'manage_accounts', danger: false },
  { to: localePath('/athlete/wallet'), label: t('nav.wallet'), icon: 'account_balance_wallet', danger: false },
  { to: localePath('/athlete/payments'), label: t('athlete.paymentMethods'), icon: 'credit_card', danger: false },
  { to: localePath('/athlete/notifications'), label: t('nav.notifications'), icon: 'notifications', danger: false },
  { to: localePath('/contact'), label: t('athlete.support'), icon: 'support_agent', danger: false },
  { to: localePath('/privacy'), label: t('legal.privacy'), icon: 'privacy_tip', danger: false },
])

async function handleLogout() {
  await logout()
}
</script>

<template>
  <div class="venus-page-stack">
    <div class="canva-athlete-hub">
    <section class="canva-dash-hero">
      <div class="flex items-center gap-4">
        <div class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-white/40 bg-white/15 text-lg font-bold">
          <img v-if="avatarUrl" :src="avatarUrl" alt="" class="h-full w-full object-cover" />
          <span v-else>{{ initials }}</span>
        </div>
        <div class="min-w-0">
          <h1 class="truncate text-xl font-bold">{{ displayName || firstName }}</h1>
          <p v-if="phone" class="mt-0.5 truncate text-sm tabular-nums text-white/85" dir="ltr">{{ phone }}</p>
          <p v-else class="mt-0.5 text-sm text-white/70">{{ addMobileHint }}</p>
        </div>
      </div>

      <div class="canva-dash-hero-stats">
        <div class="canva-dash-stat" style="border-radius: var(--sz-canva-radius);">
          <p class="canva-dash-stat-value">{{ pending ? '…' : spendDisplay }}</p>
          <p class="canva-dash-stat-label">{{ spendUnit }}</p>
        </div>
        <div class="canva-dash-stat" style="border-radius: var(--sz-canva-radius);">
          <p class="canva-dash-stat-value">{{ pending ? '…' : ratingDisplay }}</p>
          <p class="canva-dash-stat-label">{{ t('athlete.statRating') }}</p>
        </div>
        <div class="canva-dash-stat" style="border-radius: var(--sz-canva-radius);">
          <p class="canva-dash-stat-value">{{ pending ? '…' : formatNumber(bookingCount) }}</p>
          <p class="canva-dash-stat-label">{{ t('athlete.statBookings') }}</p>
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
        <span class="canva-dash-menu-icon">
          <AppIcon :name="item.icon" size="sm" />
        </span>
        <span class="flex-1">{{ item.label }}</span>
        <AppIcon name="chevron_left" size="sm" class="text-brand-gray-400" />
      </NuxtLink>
      <button type="button" class="canva-dash-menu-item !text-brand-primary" @click="handleLogout">
        <span class="canva-dash-menu-icon">
          <AppIcon name="logout" size="sm" />
        </span>
        <span class="flex-1">{{ t('athlete.logoutAccount') }}</span>
      </button>
    </div>
    </div>

    <p class="sr-only">{{ formatCurrency(spendTotal) }}</p>
  </div>
</template>
