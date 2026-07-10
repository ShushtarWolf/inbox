<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE' , ssr: false})

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { data, refresh } = await useAuthedFetch('/api/bookings/mine')
const { localizedField } = useLocalizedField()
const { formatCurrency, formatTimeRange, formatHours, formatIsoDate } = useFormatters()
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
  if (!confirm(t('booking.confirmCancel'))) return
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

const reviewRating = ref(5)
const reviewBody = ref('')
const reviewSubmitting = ref(false)
const reviewDone = ref(false)

const canReview = computed(() =>
  booking.value?.status === 'CONFIRMED' && !booking.value?.review && booking.value?.slot?.date < today(),
)

async function submitReview() {
  if (!booking.value) return
  reviewSubmitting.value = true
  try {
    await $fetch('/api/reviews', {
      method: 'POST',
      body: { bookingId: booking.value.id, rating: reviewRating.value, body: reviewBody.value },
    })
    reviewDone.value = true
    await refresh()
  } finally {
    reviewSubmitting.value = false
  }
}
</script>

<template>
  <div v-if="booking" class="space-y-4">
    <PageHeaderNav
      :title="localizedField(booking.slot.court.club, 'nameFa', 'nameEn')"
      :subtitle="`${formatIsoDate(booking.slot.date)} · ${formatTimeRange(booking.slot.startTime)}`"
      :home-to="localePath('/')"
      :back-to="localePath('/athlete/bookings')"
    />
    <div class="ios-card space-y-2 p-4">
      <div class="flex flex-wrap gap-2 text-xs">
        <span class="neo-badge">{{ bookingStatusLabel(booking.status) }}</span>
        <span class="neo-badge bg-white">{{ paymentStatusLabel(booking.payment?.status || booking.paymentStatus) }}</span>
      </div>
      <p class="text-xs text-brand-gray-600">{{ $t('booking.reservationId') }}: <bdi dir="ltr" class="tabular-nums">{{ booking.id }}</bdi></p>
      <p class="text-sm font-bold">{{ formatCurrency(booking.payment?.amount || booking.slot.price) }}</p>
      <p class="text-sm text-brand-gray-600">{{ $t('owner.paymentMethod') }}: {{ $t(`owner.paymentMethods.${booking.payment?.method || booking.paymentMethod || 'NOT_PAID'}`) }}</p>
      <p class="text-sm text-brand-gray-600">{{ formatHours(booking.slot.court.club.cancellationWindowHours) }} {{ $t('booking.cancellationWindow') }}</p>
      <p class="text-sm text-brand-gray-600">{{ formatHours(booking.slot.court.club.rescheduleWindowHours) }} {{ $t('booking.rescheduleWindow') }}</p>
      <div v-if="booking.status !== 'CANCELLED'" class="flex flex-wrap gap-2 pt-2">
        <button type="button" class="btn-ghost" @click="cancelBooking">{{ $t('booking.cancel') }}</button>
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
          class="neo-input text-start text-sm"
          :class="rescheduleSlotId === slot.id ? 'neo-pill-active shadow-brutal' : ''"
          @click="rescheduleSlotId = slot.id"
        >
          {{ localizedField(slot.court, 'nameFa', 'nameEn') }} · <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(slot.startTime) }}</bdi>
        </button>
      </div>
      <p v-else class="text-sm text-brand-gray-600">{{ $t('booking.noSlots') }}</p>
      <button type="button" class="btn-primary w-full" :disabled="!rescheduleSlotId" @click="rescheduleBooking">{{ $t('booking.confirm') }}</button>
    </div>

    <div v-if="canReview && !reviewDone" class="ios-card space-y-3 p-4">
      <h2 class="font-bold">{{ $t('reviews.submitTitle') }}</h2>
      <input v-model.number="reviewRating" type="number" min="1" max="5" class="neo-input" />
      <textarea v-model="reviewBody" class="neo-input" rows="3" :placeholder="$t('reviews.bodyPlaceholder')" />
      <button type="button" class="btn-primary w-full" :disabled="reviewSubmitting || !reviewBody" @click="submitReview">{{ $t('reviews.submit') }}</button>
    </div>
    <p v-else-if="reviewDone" class="text-sm text-brand-primary">{{ $t('reviews.thanks') }}</p>
  </div>
</template>
