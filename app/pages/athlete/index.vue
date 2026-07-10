<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const localePath = useLocalePath()
const { t } = useI18n()
const { formatIsoDate, formatTimeRange } = useFormatters()
const { data, pending, error } = useAuthedFetch('/api/bookings/mine')

const nextCourt = computed(() => data.value?.courtBookings?.[0])
const nextCoach = computed(() => data.value?.coachSessions?.[0])
const next = computed(() => nextCourt.value || nextCoach.value)

const nextLabel = computed(() => {
  if (!next.value) return ''
  if ('slot' in next.value && next.value.slot) {
    return `${formatIsoDate(next.value.slot.date)} · ${formatTimeRange(next.value.slot.startTime, next.value.slot.endTime)}`
  }
  return `${formatIsoDate(next.value.date)} · ${formatTimeRange(next.value.startTime, next.value.endTime)}`
})
</script>

<template>
  <div class="venus-page-stack">
    <div class="ios-card p-4">
      <h2 class="font-bold">{{ $t('nav.overview') }}</h2>
      <p v-if="error" class="mt-2 text-sm text-red-600">{{ t('auth.dashboardLoadFailed') }}</p>
      <AppVenusSkeleton v-else-if="pending" :lines="2" :show-card="false" class="mt-2" />
      <p v-else-if="next" class="mt-2 text-sm" dir="auto">{{ nextLabel }}</p>
      <p v-else class="mt-2 ios-card border-dashed p-3 text-sm text-brand-gray-600">{{ $t('athlete.nextBookingFallback') }}</p>
    </div>
    <NuxtLink :to="localePath('/athlete/bookings')" class="btn-primary block text-center">{{ $t('nav.bookings') }}</NuxtLink>
  </div>
</template>
