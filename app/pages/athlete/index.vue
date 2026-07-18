<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const localePath = useLocalePath()
const { t } = useI18n()
const { formatIsoDate, formatTimeRange } = useFormatters()
const { localizedField } = useLocalizedField()
const {
  bookingStatusLabel,
  paymentStatusLabel,
  bookingStatusBadgeClass,
  paymentStatusBadgeClass,
  isPayAtClubStatus,
} = useBookingLabels()
const { data, pending, error } = useAuthedFetch('/api/bookings/mine')

const nextCourt = computed(() => data.value?.courtBookings?.[0])
const nextCoach = computed(() => data.value?.coachSessions?.[0])
const next = computed(() => nextCourt.value || nextCoach.value)

const nextDetailTo = computed(() => {
  if (nextCourt.value) return localePath(`/athlete/bookings/${nextCourt.value.id}`)
  if (nextCoach.value) return localePath(`/athlete/bookings/coach/${nextCoach.value.id}`)
  return localePath('/athlete/bookings')
})

const nextClubLabel = computed(() => {
  if (nextCourt.value?.slot?.court?.club) {
    return localizedField(nextCourt.value.slot.court.club, 'nameFa', 'nameEn')
  }
  if (nextCoach.value?.coach) {
    return localizedField(nextCoach.value.coach, 'nameFa', 'nameEn')
  }
  return ''
})

const nextLabel = computed(() => {
  if (!next.value) return ''
  if ('slot' in next.value && next.value.slot) {
    return `${formatIsoDate(next.value.slot.date)} · ${formatTimeRange(next.value.slot.startTime, next.value.slot.endTime)}`
  }
  return `${formatIsoDate(next.value.date)} · ${formatTimeRange(next.value.startTime, next.value.endTime)}`
})

const nextPaymentStatus = computed(() => {
  if (!next.value) return null
  return next.value.payment?.status || next.value.paymentStatus || null
})
</script>

<template>
  <div class="venus-page-stack">
    <div class="ios-card p-4">
      <h2 class="font-bold">{{ $t('athlete.nextBookingTitle') }}</h2>
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
          <NuxtLink :to="nextDetailTo" class="mt-3 inline-block text-xs font-bold text-brand-primary">{{ t('common.detail') }}</NuxtLink>
        </template>
        <p v-else class="mt-2 ios-card border-dashed p-3 text-sm text-brand-gray-600">{{ $t('athlete.nextBookingFallback') }}</p>
      </AppAsyncState>
    </div>

    <NuxtLink :to="localePath('/clubs')" class="btn-primary block text-center">{{ $t('athlete.bookCourtCta') }}</NuxtLink>
    <NuxtLink :to="localePath('/athlete/bookings')" class="btn-ghost block text-center">{{ $t('nav.bookings') }}</NuxtLink>
  </div>
</template>
