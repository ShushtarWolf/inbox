<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE' })

const route = useRoute()
const { data } = await useAuthedFetch('/api/bookings/mine')
const { localizedField } = useLocalizedField()
const booking = computed(() => data.value?.courtBookings?.find((b: { id: string }) => b.id === route.params.id))
</script>

<template>
  <div v-if="booking" class="ios-card space-y-2 p-4">
    <h1 class="font-bold">{{ localizedField(booking.slot.court.club, 'nameFa', 'nameEn') }}</h1>
    <p>{{ booking.slot.date }} · {{ booking.slot.startTime }}</p>
    <p class="text-sm text-brand-primary">{{ $t('booking.payAtClub') }}</p>
    <p class="text-sm text-brand-gray-600">{{ booking.slot.court.club.cancellationWindowHours }}h {{ $t('booking.cancellationWindow') }}</p>
    <p class="text-sm text-brand-gray-600">{{ booking.slot.court.club.rescheduleWindowHours }}h {{ $t('booking.rescheduleWindow') }}</p>
  </div>
</template>
