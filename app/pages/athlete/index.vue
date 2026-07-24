<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const localePath = useLocalePath()
const { t } = useI18n()
const { displayName, avatarUrl, initials, firstName } = useAuth()
const { formatIsoDate, formatTimeRange } = useFormatters()
const { localizedField } = useLocalizedField()
const {
  bookingStatusLabel,
  paymentStatusLabel,
  bookingStatusBadgeClass,
  paymentStatusBadgeClass,
  isPayAtClubStatus,
  paidHonestyNote,
} = useBookingLabels()
const { data, pending, error } = useAuthedFetch('/api/bookings/mine')

const nextCourt = computed(() => data.value?.courtBookings?.[0])
const next = computed(() => nextCourt.value)

const nextDetailTo = computed(() => {
  if (nextCourt.value) return localePath(`/athlete/bookings/${nextCourt.value.id}`)
  return localePath('/athlete/bookings')
})

const nextClubLabel = computed(() => {
  if (nextCourt.value?.slot?.court?.club) {
    return localizedField(nextCourt.value.slot.court.club, 'nameFa', 'nameEn')
  }
  return ''
})

const nextLabel = computed(() => {
  if (!next.value?.slot) return ''
  return `${formatIsoDate(next.value.slot.date)} · ${formatTimeRange(next.value.slot.startTime, next.value.slot.endTime)}`
})

const nextPaymentStatus = computed(() => {
  if (!next.value) return null
  return next.value.payment?.status || next.value.paymentStatus || null
})

const menu = computed(() => [
  { to: localePath('/athlete/bookings'), label: t('nav.bookings'), icon: 'confirmation_number' },
  { to: localePath('/clubs'), label: t('athlete.bookCourtCta'), icon: 'sports_tennis' },
  { to: localePath('/athlete/wallet'), label: t('nav.wallet'), icon: 'account_balance_wallet' },
  { to: localePath('/athlete/notifications'), label: t('nav.notifications'), icon: 'notifications' },
  { to: localePath('/athlete/profile'), label: t('nav.profile'), icon: 'person' },
  { to: localePath('/contact'), label: t('legal.contact'), icon: 'support_agent' },
])
</script>

<template>
  <div class="venus-page-stack">
    <section class="canva-dash-hero">
      <div class="flex items-center gap-4">
        <div class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-white/40 bg-white/15 text-lg font-bold">
          <img v-if="avatarUrl" :src="avatarUrl" alt="" class="h-full w-full object-cover" />
          <span v-else>{{ initials }}</span>
        </div>
        <div class="min-w-0">
          <p class="text-xs text-white/80">{{ t('dashboard.athlete') }}</p>
          <h1 class="truncate text-xl font-bold">{{ displayName || firstName }}</h1>
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
        <span class="venus-icon-wrap venus-icon-wrap-sm bg-brand-primary-soft text-brand-primary">
          <AppIcon :name="item.icon" size="sm" />
        </span>
        <span class="flex-1">{{ item.label }}</span>
        <AppIcon name="chevron_left" size="sm" class="text-brand-gray-400" />
      </NuxtLink>
    </div>

    <div class="ios-card p-4">
      <h2 class="font-bold">{{ t('athlete.nextBookingTitle') }}</h2>
      <AppAsyncState
        :pending="pending"
        :error="error ? t('auth.dashboardLoadFailed') : false"
        inline
        :skeleton-lines="2"
        skeleton-variant="default"
      >
        <template v-if="next">
          <p v-if="nextClubLabel" class="mt-2 text-sm font-bold">{{ nextClubLabel }}</p>
          <p class="mt-1 text-sm" dir="auto">{{ nextLabel }}</p>
          <div class="mt-2 flex flex-wrap gap-2 text-xs">
            <span class="neo-badge" :class="bookingStatusBadgeClass(next.status)">{{ bookingStatusLabel(next.status) }}</span>
            <span class="neo-badge" :class="paymentStatusBadgeClass(nextPaymentStatus)">{{ paymentStatusLabel(nextPaymentStatus) }}</span>
          </div>
          <p v-if="isPayAtClubStatus(nextPaymentStatus)" class="mt-2 text-xs text-brand-gray-600">{{ t('booking.payAtClubDetail') }}</p>
          <p v-if="paidHonestyNote(nextPaymentStatus)" class="mt-2 text-xs text-brand-gray-600">{{ paidHonestyNote(nextPaymentStatus) }}</p>
          <NuxtLink :to="nextDetailTo" class="mt-3 inline-block text-xs font-bold text-brand-primary">{{ t('common.detail') }}</NuxtLink>
        </template>
        <p v-else class="mt-2 rounded-lg border border-dashed border-brand-gray-200 p-3 text-sm text-brand-gray-600">
          {{ t('athlete.nextBookingFallback') }}
        </p>
      </AppAsyncState>
    </div>
  </div>
</template>
