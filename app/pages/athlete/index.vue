<script setup lang="ts">
/** Canva p22 user hub: profile + stats + account list (not a booking overview). */
import {
  countActiveAthleteBookings,
  sumAthleteSettledSpend,
} from '#shared/bookingPayment.ts'

definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const localePath = useLocalePath()
const { t } = useI18n()
const { displayName, avatarUrl, initials, firstName, user, logout } = useAuth()
const { formatCurrency, formatNumber, formatPhone } = useFormatters()
const { smsLive } = useSmsCapability()
const { pilotNoCoach, competitionsEnabled } = usePilotFlags()

const { data: myCompetitions } = useAuthedFetch<Array<{ status: string }>>('/api/athlete/competitions', {
  immediate: competitionsEnabled.value,
})

const activeEntryCount = computed(() => {
  const entries = myCompetitions.value || []
  return entries.filter((entry) => entry.status === 'PENDING' || entry.status === 'CONFIRMED').length
})
const { data, pending } = useAuthedFetch<{
  courtBookings?: Array<{
    status?: string
    paymentStatus?: string
    payment?: { amount?: number; status?: string } | null
  }>
  coachSessions?: Array<{
    status?: string
    paymentStatus?: string
    payment?: { amount?: number; status?: string } | null
  }>
  packageBookings?: Array<{
    status?: string
    paymentStatus?: string
    payment?: { amount?: number; status?: string } | null
  }>
}>('/api/bookings/mine')
const { data: wallet, pending: walletPending } = useAuthedFetch<{ balance?: number }>('/api/wallet')
const showPhoto = ref(true)

watch(avatarUrl, (url) => {
  showPhoto.value = Boolean(url)
}, { immediate: true })

const phone = computed(() => user.value?.phone || '')

const addMobileHint = computed(() =>
  smsLive.value ? t('athlete.addMobileForSmsMulti') : t('athlete.addMobileForSmsSingle'),
)

const bookingCount = computed(() => {
  const courts = countActiveAthleteBookings(data.value?.courtBookings || [])
  if (pilotNoCoach.value) return courts
  const coaches = countActiveAthleteBookings(data.value?.coachSessions || [])
  const packages = countActiveAthleteBookings(data.value?.packageBookings || [])
  return courts + coaches + packages
})

/** Settled PAID only — never list-price fallbacks; amount 0 siblings stay 0. */
const spendTotal = computed(() => {
  const court = sumAthleteSettledSpend(data.value?.courtBookings || [])
  if (pilotNoCoach.value) return court
  return court
    + sumAthleteSettledSpend(data.value?.coachSessions || [])
    + sumAthleteSettledSpend(data.value?.packageBookings || [])
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
  ...(competitionsEnabled.value
    ? [{
        to: localePath('/athlete/competitions'),
        label: t('competitions.nav'),
        icon: 'emoji_events',
        danger: false,
        badge: activeEntryCount.value > 0 ? activeEntryCount.value : undefined,
      }]
    : []),
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
          <img
            v-if="avatarUrl && showPhoto"
            :src="avatarUrl"
            alt=""
            class="h-full w-full object-cover"
            @error="showPhoto = false"
          />
          <span v-else>{{ initials }}</span>
        </div>
        <div class="min-w-0 text-start">
          <h1 class="truncate text-xl font-bold text-white">{{ displayName || firstName }}</h1>
          <p v-if="phone" class="mt-0.5 truncate text-sm tabular-nums text-white/85" dir="ltr">{{ formatPhone(phone) }}</p>
          <p v-else class="mt-0.5 text-sm text-white/70">{{ addMobileHint }}</p>
        </div>
      </div>
      <p class="mt-3 text-start text-xs text-white/80">{{ t('booking.walletBalance') }}</p>
      <p class="text-start text-lg font-bold tabular-nums text-white">
        <span dir="ltr">{{ walletPending ? '…' : formatCurrency(wallet?.balance || 0) }}</span>
      </p>

      <div class="canva-dash-hero-stats">
        <div class="canva-dash-stat" style="border-radius: var(--sz-canva-radius);">
          <p class="canva-dash-stat-value">{{ pending ? '…' : formatNumber(bookingCount) }}</p>
          <p class="canva-dash-stat-label">{{ t('athlete.statBookings') }}</p>
        </div>
        <div class="canva-dash-stat" style="border-radius: var(--sz-canva-radius);">
          <p class="canva-dash-stat-value">{{ pending ? '…' : ratingDisplay }}</p>
          <p class="canva-dash-stat-label">{{ t('athlete.statRating') }}</p>
        </div>
        <div class="canva-dash-stat" style="border-radius: var(--sz-canva-radius);">
          <p class="canva-dash-stat-value">{{ pending ? '…' : spendDisplay }}</p>
          <p class="canva-dash-stat-label">{{ spendUnit }}</p>
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
        <span
          v-if="item.badge"
          class="bg-brand-primary px-1.5 py-0.5 text-[10px] font-bold text-white"
          style="border-radius: var(--sz-canva-radius);"
        >{{ item.badge }}</span>
        <AppIcon name="chevron_left" size="sm" class="text-brand-gray-400" />
      </NuxtLink>
      <button type="button" class="canva-dash-menu-item !text-brand-primary" @click="handleLogout">
        <span class="canva-dash-menu-icon">
          <AppIcon name="logout" size="sm" />
        </span>
        <span class="flex-1">{{ t('athlete.logoutAccount') }}</span>
      </button>
    </div>
    <div class="mt-4 px-1">
      <RoleDashboardSwitcher current="ATHLETE" />
    </div>
    </div>

    <p class="sr-only">{{ formatCurrency(spendTotal) }}</p>
  </div>
</template>
