<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { data, pending, error, refresh } = await useAuthedFetch('/api/bookings/mine')
const { localizedField } = useLocalizedField()
const { formatCurrency, formatTimeRange, formatHours, formatIsoDate } = useFormatters()
const { today } = useLocalDate()
const booking = computed(() => data.value?.courtBookings?.find((b: { id: string }) => b.id === route.params.id))
const rescheduleOpen = ref(false)
const rescheduleDate = ref(today())
const rescheduleSlotId = ref('')
const reschedulePending = ref(false)
const cancelOpen = ref(false)
const cancelPending = ref(false)
const noticeBody = ref('')

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
  if (rescheduleOpen.value) {
    rescheduleSlotId.value = ''
    refreshSlots()
  }
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

function requestCancel() {
  if (!booking.value || booking.value.status === 'CANCELLED') return
  actionError.value = ''
  cancelOpen.value = true
}

function closeCancel() {
  if (cancelPending.value) return
  cancelOpen.value = false
}

async function confirmCancel() {
  if (!booking.value || booking.value.status === 'CANCELLED') return
  cancelPending.value = true
  actionError.value = ''
  try {
    const result = await $fetch<{ refund?: { walletCredited?: boolean; refunded?: boolean } }>(`/api/bookings/${booking.value.id}/cancel`, { method: 'PATCH' })
    cancelOpen.value = false
    if (result.refund?.walletCredited) noticeBody.value = t('booking.refundToWallet')
    else if (result.refund?.refunded) noticeBody.value = t('booking.refundToGateway')
    await refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
    cancelOpen.value = false
  } finally {
    cancelPending.value = false
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

async function openReschedule() {
  if (!booking.value || booking.value.status === 'CANCELLED') return
  actionError.value = ''
  rescheduleOpen.value = true
  rescheduleSlotId.value = ''
  rescheduleDate.value = booking.value.slot.date
  await refreshSlots()
}

function closeReschedule() {
  if (reschedulePending.value) return
  rescheduleOpen.value = false
  rescheduleSlotId.value = ''
}

async function rescheduleBooking() {
  if (!booking.value || !rescheduleSlotId.value) return
  actionError.value = ''
  reschedulePending.value = true
  try {
    await $fetch(`/api/bookings/${booking.value.id}/reschedule`, {
      method: 'PATCH',
      body: { slotId: rescheduleSlotId.value },
    })
    rescheduleOpen.value = false
    rescheduleSlotId.value = ''
    await refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  } finally {
    reschedulePending.value = false
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
  <div class="venus-page-stack">
    <AppAsyncState :pending="pending" :error="error" :empty="!booking" skeleton-variant="default">
      <div v-if="booking" class="space-y-4">
        <section class="canva-dash-hero">
          <NuxtLink :to="localePath('/athlete/bookings')" class="text-xs font-bold text-white/85">
            ← {{ $t('nav.myBookings') }}
          </NuxtLink>
          <p class="mt-2 text-xs text-white/80">{{ $t('common.detail') }}</p>
          <h1 class="mt-1 text-2xl font-bold text-white">{{ localizedField(booking.slot.court.club, 'nameFa', 'nameEn') }}</h1>
          <p class="mt-1 text-sm text-white/85">{{ formatIsoDate(booking.slot.date) }} · {{ formatTimeRange(booking.slot.startTime) }}</p>
        </section>
        <div class="canva-panel space-y-2">
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
          <p class="text-sm font-bold text-brand-navy">{{ formatCurrency(booking.payment?.amount || booking.slot.price) }}</p>
          <p class="text-sm text-brand-gray-600">{{ $t('owner.paymentMethod') }}: {{ $t(`owner.paymentMethods.${booking.payment?.method || booking.paymentMethod || 'NOT_PAID'}`) }}</p>
          <p class="text-sm text-brand-gray-600">{{ formatHours(booking.slot.court.club.cancellationWindowHours) }} {{ $t('booking.cancellationWindow') }}</p>
          <p class="text-sm text-brand-gray-600">{{ formatHours(booking.slot.court.club.rescheduleWindowHours) }} {{ $t('booking.rescheduleWindow') }}</p>
          <p class="text-xs text-brand-gray-600">{{ cancelRefundNote(paymentStatus) }}</p>
          <p v-if="actionError" class="canva-flash-error">{{ actionError }}</p>
          <div v-if="booking.status !== 'CANCELLED'" class="flex flex-col gap-2 pt-2">
            <button
              v-if="onlineEnabled && canPayOnline(paymentStatus)"
              type="button"
              class="canva-gate-btn-primary"
              :disabled="paying"
              @click="payBooking()"
            >
              {{ paying ? $t('common.loading') : $t('booking.payNow') }}
            </button>
            <button
              v-if="canPayWithWallet(paymentStatus) && (wallet?.balance || 0) > 0"
              type="button"
              class="canva-gate-btn-secondary"
              :disabled="paying"
              @click="payBooking(true)"
            >
              {{ paying ? $t('common.loading') : `${$t('booking.payWithWallet')} (${formatCurrency(wallet?.balance || 0)})` }}
            </button>
            <button type="button" class="canva-gate-btn-secondary" @click="openReschedule">{{ $t('booking.reschedule') }}</button>
            <button type="button" class="canva-gate-btn-secondary text-brand-primary" @click="requestCancel">{{ $t('booking.cancel') }}</button>
          </div>
        </div>

        <div v-if="canReview && !reviewDone" class="canva-panel venus-form-stack">
          <h2 class="font-bold text-brand-primary">{{ $t('reviews.submitTitle') }}</h2>
          <AppFormField :label="$t('reviews.ratingLabel')">
            <input v-model.number="reviewRating" type="number" min="1" max="5" dir="ltr" class="neo-input tabular-nums" />
          </AppFormField>
          <AppFormField :label="$t('reviews.bodyPlaceholder')">
            <textarea v-model="reviewBody" class="neo-textarea" rows="3" />
          </AppFormField>
          <button type="button" class="canva-gate-btn-primary" :disabled="reviewSubmitting || !reviewBody" @click="submitReview">{{ $t('reviews.submit') }}</button>
        </div>
        <p v-else-if="reviewDone" class="canva-flash-success">{{ $t('reviews.thanks') }}</p>
      </div>
    </AppAsyncState>

    <AppModal
      :open="rescheduleOpen"
      patterned
      sheet
      max-width-class="canva-phone-shell max-w-sm"
      :title="t('booking.reschedule')"
      @close="closeReschedule"
    >
      <div class="canva-auth-body space-y-4 px-5 pb-6 pt-2">
        <AppDateInput v-model="rescheduleDate" :min-date="today()" />
        <div class="max-h-64 space-y-2 overflow-auto">
          <button
            v-for="slot in replacementSlots"
            :key="slot.id"
            type="button"
            class="w-full border border-brand-gray-200 bg-white/95 px-3 py-3 text-start text-sm text-brand-navy"
            :class="rescheduleSlotId === slot.id ? 'border-brand-primary bg-brand-primary-soft/50' : ''"
            style="border-radius: var(--sz-canva-radius);"
            @click="rescheduleSlotId = slot.id"
          >
            {{ localizedField(slot.court, 'nameFa', 'nameEn') }} · <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(slot.startTime) }}</bdi>
          </button>
          <p v-if="replacementSlots && !replacementSlots.length" class="text-sm text-brand-gray-600">{{ t('booking.noSlots') }}</p>
        </div>
        <button
          type="button"
          class="canva-gate-btn-primary"
          :disabled="!rescheduleSlotId || reschedulePending"
          @click="rescheduleBooking"
        >
          {{ reschedulePending ? t('common.loading') : t('booking.confirmReschedule') }}
        </button>
        <button type="button" class="canva-gate-btn-secondary" :disabled="reschedulePending" @click="closeReschedule">
          {{ t('common.close') }}
        </button>
      </div>
    </AppModal>

    <CanvaConfirmSheet
      :open="cancelOpen"
      :title="t('booking.confirmCancelTitle')"
      :body="t('booking.confirmCancel')"
      :confirm-label="t('booking.confirmYes')"
      :dismiss-label="t('booking.confirmNo')"
      :pending="cancelPending"
      danger
      @confirm="confirmCancel"
      @close="closeCancel"
    />

    <CanvaConfirmSheet
      :open="Boolean(noticeBody)"
      :title="t('booking.refundNoticeTitle')"
      :body="noticeBody"
      :confirm-label="t('booking.noticeOk')"
      notice
      @confirm="noticeBody = ''"
      @close="noticeBody = ''"
    />
  </div>
</template>
