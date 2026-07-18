<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE' , ssr: false})

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { data, pending, error, refresh } = await useAuthedFetch('/api/bookings/mine')
const { localizedField } = useLocalizedField()
const { formatCurrency, formatTimeRange, formatHours, formatIsoDate } = useFormatters()
const { today } = useLocalDate()
const session = computed(() => data.value?.coachSessions?.find((item: { id: string }) => item.id === route.params.id))
const rescheduleDate = ref(today())
const startTime = ref('')

const { data: availability, refresh: refreshAvailability } = await useAuthedFetch(() => `/api/coaches/${session.value?.coachId}/availability`, {
  query: computed(() => ({ date: rescheduleDate.value })),
  immediate: false,
})

watch(session, (value) => {
  if (value) {
    rescheduleDate.value = value.date
    startTime.value = value.startTime
  }
}, { immediate: true })

watch(rescheduleDate, () => {
  if (session.value && session.value.status !== 'CANCELLED') refreshAvailability()
})

watch(availability, (value) => {
  if (value?.slots?.length && !value.slots.some((slot: { startTime: string }) => slot.startTime === startTime.value)) {
    startTime.value = value.slots[0].startTime
  }
})

function bookingStatusLabel(status: string) {
  return t(`booking.status.${status}`)
}

function paymentStatusLabel(status: string) {
  return t(`booking.paymentStatus.${status}`)
}

function bookingStatusBadgeClass(status: string) {
  if (status === 'CONFIRMED') return 'tail-badge-success'
  if (status === 'CANCELLED') return 'tail-badge-danger'
  if (status === 'PENDING') return 'tail-badge-warning'
  return 'tail-badge-gray'
}

const {
  paymentStatusBadgeClass,
  isPayAtClubStatus,
  cancelRefundNote,
} = useBookingLabels()
const paymentStatus = computed(() => session.value?.payment?.status || session.value?.paymentStatus)
const actionError = ref('')
const { fetchErrorMessage } = useFetchError()

async function cancelSession() {
  if (!session.value || session.value.status === 'CANCELLED') return
  if (!confirm(t('booking.confirmCancel'))) return
  actionError.value = ''
  try {
    await $fetch(`/api/coach-sessions/${session.value.id}/cancel`, { method: 'PATCH' })
    await refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  }
}

async function loadAvailability() {
  if (!session.value || session.value.status === 'CANCELLED') return
  await refreshAvailability()
}

async function rescheduleSession() {
  if (!session.value || !startTime.value) return
  await $fetch(`/api/coach-sessions/${session.value.id}/reschedule`, {
    method: 'PATCH',
    body: {
      date: rescheduleDate.value,
      startTime: startTime.value,
    },
  })
  await refresh()
}
</script>

<template>
  <div class="tail-page-stack">
    <AppAsyncState :pending="pending" :error="error" :empty="!session" skeleton-variant="default">
  <div v-if="session" class="space-y-4">
    <PageHeaderNav
      :title="localizedField(session.coach, 'nameFa', 'nameEn')"
      :subtitle="`${formatIsoDate(session.date)} · ${formatTimeRange(session.startTime)}`"
      :show-actions="false"
    />

    <div class="ios-card space-y-2 p-4">
      <div class="flex flex-wrap gap-2 text-xs">
        <span class="neo-badge" :class="bookingStatusBadgeClass(session.status)">{{ bookingStatusLabel(session.status) }}</span>
        <span class="neo-badge" :class="paymentStatusBadgeClass(paymentStatus)">{{ paymentStatusLabel(paymentStatus) }}</span>
      </div>
      <p v-if="session.status !== 'CANCELLED' && isPayAtClubStatus(paymentStatus)" class="text-sm text-brand-gray-600">
        {{ $t('booking.payAtClubDetail') }}
      </p>
      <p class="text-xs text-brand-gray-600">{{ $t('booking.reservationId') }}: <bdi dir="ltr" class="tabular-nums">{{ session.id }}</bdi></p>
      <p class="text-sm font-bold">{{ formatCurrency(session.payment?.amount || session.price) }}</p>
      <p class="text-sm text-brand-gray-600">{{ $t('owner.paymentMethod') }}: {{ $t(`owner.paymentMethods.${session.payment?.method || 'NOT_PAID'}`) }}</p>
      <p class="text-sm text-brand-gray-600">{{ formatHours(session.coach.club?.cancellationWindowHours || 24) }} {{ $t('booking.cancellationWindow') }}</p>
      <p class="text-sm text-brand-gray-600">{{ formatHours(session.coach.club?.rescheduleWindowHours || 24) }} {{ $t('booking.rescheduleWindow') }}</p>
      <p class="text-xs text-brand-gray-600">{{ cancelRefundNote() }}</p>
      <p v-if="actionError" class="text-sm text-red-600">{{ actionError }}</p>
      <div v-if="session.status !== 'CANCELLED'" class="flex flex-wrap gap-2 pt-2">
        <button type="button" class="btn-ghost" @click="cancelSession">{{ $t('booking.cancel') }}</button>
        <button type="button" class="btn-primary" @click="loadAvailability">{{ $t('booking.reschedule') }}</button>
      </div>
    </div>

    <div v-if="session.status !== 'CANCELLED'" class="ios-card space-y-3 p-4">
      <h2 class="font-bold">{{ $t('booking.reschedule') }}</h2>
      <AppDateInput v-model="rescheduleDate" :min-date="today()" />
      <select v-model="startTime" class="neo-input" dir="ltr">
        <option v-for="slot in availability?.slots || []" :key="slot.startTime" :value="slot.startTime">
          {{ formatTimeRange(slot.startTime, slot.endTime) }} — {{ formatCurrency(availability?.sessionPrice || session.price) }}
        </option>
      </select>
      <p v-if="availability && !availability.slots?.length" class="text-sm text-brand-gray-600">{{ $t('booking.noSlots') }}</p>
      <button type="button" class="btn-primary w-full" :disabled="!startTime" @click="rescheduleSession">{{ $t('booking.confirm') }}</button>
    </div>
  </div>
    </AppAsyncState>
  </div>
</template>
