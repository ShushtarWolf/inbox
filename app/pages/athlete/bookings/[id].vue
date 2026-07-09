<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE' , ssr: false})

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { data, refresh } = await useAuthedFetch('/api/bookings/mine')
const { localizedField } = useLocalizedField()
const { formatCurrency, formatTimeRange, formatHours } = useFormatters()
const { today } = useLocalDate()
const booking = computed(() => data.value?.courtBookings?.find((b: { id: string }) => b.id === route.params.id))
const rescheduleDate = ref(today())
const rescheduleSlotId = ref('')

const { data: replacementSlots, refresh: refreshSlots } = await useAuthedFetch('/api/slots/available', {
  query: computed(() => ({
    club: booking.value?.slot?.court?.club?.slug,
    date: rescheduleDate.value,
  })),
  immediate: false,
})

watch(booking, (value) => {
  if (value) {
    rescheduleDate.value = value.slot.date
  }
}, { immediate: true })

watch(rescheduleDate, () => {
  if (booking.value && booking.value.status !== 'CANCELLED') refreshSlots()
})

function bookingStatusLabel(status: string) {
  return t(`booking.status.${status}`)
}

function paymentStatusLabel(status: string) {
  return t(`booking.paymentStatus.${status}`)
}

async function cancelBooking() {
  if (!booking.value || booking.value.status === 'CANCELLED') return
  await $fetch(`/api/bookings/${booking.value.id}/cancel`, { method: 'PATCH' })
  await refresh()
}

async function loadReplacementSlots() {
  if (!booking.value || booking.value.status === 'CANCELLED') return
  await refreshSlots()
}

async function rescheduleBooking() {
  if (!booking.value || !rescheduleSlotId.value) return
  await $fetch(`/api/bookings/${booking.value.id}/reschedule`, {
    method: 'PATCH',
    body: { slotId: rescheduleSlotId.value },
  })
  rescheduleSlotId.value = ''
  await refresh()
}
</script>

<template>
  <div v-if="booking" class="space-y-4">
    <PageHeaderNav
      :title="localizedField(booking.slot.court.club, 'nameFa', 'nameEn')"
      :subtitle="`${booking.slot.date} · ${booking.slot.startTime}`"
      :home-to="localePath('/')"
      :back-to="localePath('/athlete/bookings')"
    />
    <div class="ios-card space-y-2 p-4">
      <div class="flex flex-wrap gap-2 text-xs">
        <span class="rounded-full bg-brand-cream px-2 py-1 font-bold text-brand-primary">{{ bookingStatusLabel(booking.status) }}</span>
        <span class="rounded-full bg-black/5 px-2 py-1 font-bold text-brand-gray-600">{{ paymentStatusLabel(booking.payment?.status || booking.paymentStatus) }}</span>
      </div>
      <p class="text-xs text-brand-gray-600">{{ $t('booking.reservationId') }}: <bdi dir="ltr" class="tabular-nums">{{ booking.id }}</bdi></p>
      <p class="text-sm font-bold">{{ formatCurrency(booking.payment?.amount || booking.slot.price) }}</p>
      <p class="text-sm text-brand-gray-600">{{ $t('owner.paymentMethod') }}: {{ $t(`owner.paymentMethods.${booking.payment?.method || booking.paymentMethod || 'NOT_PAID'}`) }}</p>
      <p class="text-sm text-brand-gray-600">{{ formatHours(booking.slot.court.club.cancellationWindowHours) }} {{ $t('booking.cancellationWindow') }}</p>
      <p class="text-sm text-brand-gray-600">{{ formatHours(booking.slot.court.club.rescheduleWindowHours) }} {{ $t('booking.rescheduleWindow') }}</p>
      <div v-if="booking.status !== 'CANCELLED'" class="flex flex-wrap gap-2 pt-2">
        <button type="button" class="rounded-xl border px-4 py-2 text-sm font-bold" @click="cancelBooking">{{ $t('booking.cancel') }}</button>
        <button type="button" class="btn-primary" @click="loadReplacementSlots">{{ $t('booking.reschedule') }}</button>
      </div>
    </div>

    <div v-if="booking.status !== 'CANCELLED'" class="ios-card space-y-3 p-4">
      <h2 class="font-bold">{{ $t('booking.reschedule') }}</h2>
      <AppDateInput v-model="rescheduleDate" />
      <div v-if="replacementSlots?.length" class="space-y-2">
        <button
          v-for="slot in replacementSlots"
          :key="slot.id"
          type="button"
          class="w-full rounded-xl border px-3 py-2 text-start text-sm"
          :class="rescheduleSlotId === slot.id ? 'border-brand-primary text-brand-primary' : ''"
          @click="rescheduleSlotId = slot.id"
        >
          {{ localizedField(slot.court, 'nameFa', 'nameEn') }} · <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(slot.startTime) }}</bdi>
        </button>
      </div>
      <p v-else class="text-sm text-brand-gray-600">{{ $t('booking.noSlots') }}</p>
      <button type="button" class="btn-primary w-full" :disabled="!rescheduleSlotId" @click="rescheduleBooking">{{ $t('booking.confirm') }}</button>
    </div>
  </div>
</template>
