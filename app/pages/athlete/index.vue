<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const localePath = useLocalePath()
const { formatTimeRange } = useFormatters()
const { data, pending } = useAuthedFetch('/api/bookings/mine')

const nextCourt = computed(() => data.value?.courtBookings?.[0])
const nextCoach = computed(() => data.value?.coachSessions?.[0])
const next = computed(() => nextCourt.value || nextCoach.value)

const nextLabel = computed(() => {
  if (!next.value) return ''
  if ('slot' in next.value && next.value.slot) {
    return `${next.value.slot.date} · ${formatTimeRange(next.value.slot.startTime, next.value.slot.endTime)}`
  }
  return `${next.value.date} · ${formatTimeRange(next.value.startTime, next.value.endTime)}`
})
</script>

<template>
  <div class="space-y-4">
    <div class="ios-card p-4">
      <h2 class="font-bold">{{ $t('nav.overview') }}</h2>
      <p v-if="pending" class="mt-2 text-sm text-brand-gray-600">{{ $t('common.loading') }}</p>
      <p v-else-if="next" class="mt-2 text-sm"><bdi dir="ltr" class="tabular-nums">{{ nextLabel }}</bdi></p>
      <p v-else class="mt-2 rounded-lg border border-dashed border-black/10 bg-brand-cream/40 p-3 text-sm text-brand-gray-600">{{ $t('athlete.nextBookingFallback') }}</p>
    </div>
    <NuxtLink :to="localePath('/athlete/bookings')" class="btn-primary block text-center">{{ $t('nav.bookings') }}</NuxtLink>
  </div>
</template>
