<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE' , ssr: false})

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { data, pending, error, refresh } = await useAuthedFetch('/api/bookings/mine')
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

const { onlineEnabled, startCheckout, canPayOnline, canPayWithWallet } = useCheckout()
const { data: wallet } = await useAuthedFetch('/api/wallet', { lazy: true })
const {
  bookingStatusLabel,
  paymentStatusLabel,
  bookingStatusBadgeClass,
  paymentStatusBadgeClass,
  isPayAtClubStatus,
  cancelRefundNote,
  paidHonestyNote,
} = useBookingLabels()
const paying = ref(false)
const actionError = ref('')
const { fetchErrorMessage } = useFetchError()

const paymentStatus = computed(() => booking.value?.payment?.status || booking.value?.paymentStatus)

async function cancelBooking() {
  if (!booking.value || booking.value.status === 'CANCELLED') return
  if (!confirm(t('booking.confirmCancel'))) return
  actionError.value = ''
  try {
    const result = await $fetch<{ refund?: { walletCredited?: boolean } }>(`/api/bookings/${booking.value.id}/cancel`, { method: 'PATCH' })
    if (result.refund?.walletCredited) {
      alert(t('booking.refundToWallet'))
    }
    await refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  }
}

async function payBooking(useWallet = false) {
  if (!booking.value) return
  paying.value = true
  actionError.value = ''
  try {
    await startCheckout({ bookingId: booking.value.id, useWallet })
    await refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  } finally {
    paying.value = false
  }
}

async function loadReplacementSlots() {
  if (!booking.value || booking.value.status === 'CANCELLED') return
  await refreshSlots()
}

async function rescheduleBooking() {
  if (!booking.value || !rescheduleSlotId.value) return
  actionError.value = ''
  try {
    await $fetch(`/api/bookings/${booking.value.id}/reschedule`, {
      method: 'PATCH',
      body: { slotId: rescheduleSlotId.value },
    })
    rescheduleSlotId.value = ''
    await refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  }
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
  <div class="tail-page-stack">
    <AppAsyncState :pending="pending" :error="error" :empty="!booking" skeleton-variant="default">
  <div v-if="booking" class="space-y-4">
    <PageHeaderNav
      :title="localizedField(booking.slot.court.club, 'nameFa', 'nameEn')"
      :subtitle="`${formatIsoDate(booking.slot.date)} · ${formatTimeRange(booking.slot.startTime)}`"
      :show-actions="false"
    />
    <div class="ios-card space-y-2 p-4">
      <div class="flex flex-wrap gap-2 text-xs">
        <span class="neo-badge" :class="bookingStatusBadgeClass(booking.status)">{{ bookingStatusLabel(booking.status) }}</span>
        <span class="neo-badge" :class="paymentStatusBadgeClass(paymentStatus)">{{ paymentStatusLabel(paymentStatus) }}</span>
      </div>
      <p v-if="booking.status !== 'CANCELLED' && isPayAtClubStatus(paymentStatus)" class="text-sm text-brand-gray-600">
        {{ $t('booking.payAtClubDetail') }}
      </p>
      <p v-if="booking.status !== 'CANCELLED' && isPayAtClubStatus(paymentStatus)" class="text-sm font-bold">
        {{ $t('booking.payAtClubAmount', { amount: formatCurrency(booking.payment?.amount || booking.slot.price) }) }}
      </p>
      <p v-if="booking.status !== 'CANCELLED' && paidHonestyNote(paymentStatus)" class="text-sm text-brand-gray-600">
        {{ paidHonestyNote(paymentStatus) }}
      </p>
      <p class="text-xs text-brand-gray-600">{{ $t('booking.reservationId') }}: <bdi dir="ltr" class="tabular-nums">{{ booking.id }}</bdi></p>
      <p class="text-sm font-bold">{{ formatCurrency(booking.payment?.amount || booking.slot.price) }}</p>
      <p class="text-sm text-brand-gray-600">{{ $t('owner.paymentMethod') }}: {{ $t(`owner.paymentMethods.${booking.payment?.method || booking.paymentMethod || 'NOT_PAID'}`) }}</p>
      <p class="text-sm text-brand-gray-600">{{ formatHours(booking.slot.court.club.cancellationWindowHours) }} {{ $t('booking.cancellationWindow') }}</p>
      <p class="text-sm text-brand-gray-600">{{ formatHours(booking.slot.court.club.rescheduleWindowHours) }} {{ $t('booking.rescheduleWindow') }}</p>
      <p class="text-xs text-brand-gray-600">{{ cancelRefundNote(paymentStatus) }}</p>
      <p v-if="actionError" class="text-sm text-red-600">{{ actionError }}</p>
      <div v-if="booking.status !== 'CANCELLED'" class="flex flex-wrap gap-2 pt-2">
        <button
          v-if="onlineEnabled && canPayOnline(paymentStatus)"
          type="button"
          class="btn-primary"
          :disabled="paying"
          @click="payBooking()"
        >
          {{ paying ? $t('common.loading') : $t('booking.payNow') }}
        </button>
        <button
          v-if="canPayWithWallet(paymentStatus) && (wallet?.balance || 0) > 0"
          type="button"
          class="btn-ghost"
          :disabled="paying"
          @click="payBooking(true)"
        >
          {{ paying ? $t('common.loading') : `${$t('booking.payWithWallet')} (${formatCurrency(wallet?.balance || 0)})` }}
        </button>
        <button type="button" class="btn-ghost" @click="cancelBooking">{{ $t('booking.cancel') }}</button>
        <button type="button" class="btn-primary" @click="loadReplacementSlots">{{ $t('booking.reschedule') }}</button>
      </div>
    </div>

    <div v-if="booking.status !== 'CANCELLED'" class="ios-card space-y-3 p-4">
      <h2 class="font-bold">{{ $t('booking.reschedule') }}</h2>
      <AppDateInput v-model="rescheduleDate" :min-date="today()" />
      <div v-if="replacementSlots?.length" class="space-y-2">
        <button
          v-for="slot in replacementSlots"
          :key="slot.id"
          type="button"
          class="neo-input text-start text-sm"
          :class="rescheduleSlotId === slot.id ? 'neo-pill-active' : ''"
          @click="rescheduleSlotId = slot.id"
        >
          {{ localizedField(slot.court, 'nameFa', 'nameEn') }} · <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(slot.startTime) }}</bdi>
        </button>
      </div>
      <p v-else class="text-sm text-brand-gray-600">{{ $t('booking.noSlots') }}</p>
      <button type="button" class="btn-primary w-full" :disabled="!rescheduleSlotId" @click="rescheduleBooking">{{ $t('booking.confirm') }}</button>
    </div>

    <div v-if="canReview && !reviewDone" class="ios-card venus-form-stack p-4">
      <h2 class="font-bold">{{ $t('reviews.submitTitle') }}</h2>
      <AppFormField :label="$t('reviews.ratingLabel')">
        <input v-model.number="reviewRating" type="number" min="1" max="5" dir="ltr" class="neo-input tabular-nums" />
      </AppFormField>
      <AppFormField :label="$t('reviews.bodyPlaceholder')">
        <textarea v-model="reviewBody" class="neo-textarea" rows="3" />
      </AppFormField>
      <button type="button" class="btn-primary w-full" :disabled="reviewSubmitting || !reviewBody" @click="submitReview">{{ $t('reviews.submit') }}</button>
    </div>
    <p v-else-if="reviewDone" class="text-sm text-brand-primary">{{ $t('reviews.thanks') }}</p>
  </div>
    </AppAsyncState>
  </div>
</template>
