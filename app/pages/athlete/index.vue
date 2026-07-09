<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const localePath = useLocalePath()
const { data, pending } = useAuthedFetch('/api/bookings/mine')
const next = computed(() => data.value?.courtBookings?.[0] || data.value?.coachSessions?.[0])
</script>

<template>
  <div class="space-y-4">
    <div class="ios-card p-4">
      <h2 class="font-bold">{{ $t('nav.overview') }}</h2>
      <p v-if="pending" class="mt-2 text-sm text-brand-gray-600">{{ $t('common.loading') }}</p>
      <p v-else-if="next" class="mt-2 text-sm">{{ next.slot ? next.slot.startTime : next.startTime }}</p>
      <p v-else class="mt-2 text-sm text-brand-gray-600">{{ $t('athlete.nextBookingFallback') }}</p>
    </div>
    <NuxtLink :to="localePath('/athlete/bookings')" class="btn-primary block text-center">{{ $t('nav.bookings') }}</NuxtLink>
  </div>
</template>
