<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { data, pending, error, refresh } = await useAuthedFetch('/api/bookings/mine')
const { localizedField } = useLocalizedField()
const { formatCurrency, formatTimeRange, formatHours, formatIsoDate } = useFormatters()
const { today } = useLocalDate()
const session = computed(() => data.value?.coachSessions?.find((item: { id: string }) => item.id === route.params.id))
const rescheduleOpen = ref(false)
const rescheduleDate = ref(today())
const startTime = ref('')
const reschedulePending = ref(false)
const cancelOpen = ref(false)
const cancelPending = ref(false)
const noticeBody = ref('')
const actionError = ref('')
const { fetchErrorMessage } = useFetchError()

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
  if (rescheduleOpen.value) refreshAvailability()
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
  paidHonestyNote,
} = useBookingLabels()
const paymentStatus = computed(() => session.value?.payment?.status || session.value?.paymentStatus)

function requestCancel() {
  if (!session.value || session.value.status === 'CANCELLED') return
  actionError.value = ''
  cancelOpen.value = true
}

function closeCancel() {
  if (cancelPending.value) return
  cancelOpen.value = false
}

async function confirmCancel() {
  if (!session.value || session.value.status === 'CANCELLED') return
  cancelPending.value = true
  actionError.value = ''
  try {
    const result = await $fetch<{ refund?: { walletCredited?: boolean } }>(`/api/coach-sessions/${session.value.id}/cancel`, { method: 'PATCH' })
    cancelOpen.value = false
    if (result.refund?.walletCredited) noticeBody.value = t('booking.refundToWallet')
    await refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
    cancelOpen.value = false
  } finally {
    cancelPending.value = false
  }
}

async function openReschedule() {
  if (!session.value || session.value.status === 'CANCELLED') return
  actionError.value = ''
  rescheduleOpen.value = true
  rescheduleDate.value = session.value.date
  startTime.value = session.value.startTime
  await refreshAvailability()
}

function closeReschedule() {
  if (reschedulePending.value) return
  rescheduleOpen.value = false
}

async function rescheduleSession() {
  if (!session.value || !startTime.value) return
  reschedulePending.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/coach-sessions/${session.value.id}/reschedule`, {
      method: 'PATCH',
      body: {
        date: rescheduleDate.value,
        startTime: startTime.value,
      },
    })
    rescheduleOpen.value = false
    await refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  } finally {
    reschedulePending.value = false
  }
}
</script>

<template>
  <div class="venus-page-stack">
    <AppAsyncState :pending="pending" :error="error" :empty="!session" skeleton-variant="default">
      <div v-if="session" class="space-y-4">
        <section class="canva-dash-hero">
          <NuxtLink :to="localePath('/athlete/bookings')" class="text-xs font-bold text-white/85">
            ← {{ $t('nav.myBookings') }}
          </NuxtLink>
          <h1 class="mt-2 text-2xl font-bold text-white">{{ localizedField(session.coach, 'nameFa', 'nameEn') }}</h1>
          <p class="mt-1 text-sm text-white/85">{{ formatIsoDate(session.date) }} · {{ formatTimeRange(session.startTime) }}</p>
        </section>

        <div class="canva-panel space-y-2">
          <div class="flex flex-wrap gap-2 text-xs">
            <span class="neo-badge" :class="bookingStatusBadgeClass(session.status)">{{ bookingStatusLabel(session.status) }}</span>
            <span class="neo-badge" :class="paymentStatusBadgeClass(paymentStatus)">{{ paymentStatusLabel(paymentStatus) }}</span>
          </div>
          <p v-if="session.status !== 'CANCELLED' && isPayAtClubStatus(paymentStatus)" class="text-sm text-brand-gray-600">
            {{ $t('booking.payAtClubDetail') }}
          </p>
          <p v-if="session.status !== 'CANCELLED' && paidHonestyNote(paymentStatus)" class="text-sm text-brand-gray-600">
            {{ paidHonestyNote(paymentStatus) }}
          </p>
          <p class="text-xs text-brand-gray-600">{{ $t('booking.reservationId') }}: <bdi dir="ltr" class="tabular-nums">{{ session.id }}</bdi></p>
          <p class="text-sm font-bold text-brand-navy">{{ formatCurrency(session.payment?.amount || session.price) }}</p>
          <p class="text-sm text-brand-gray-600">{{ $t('owner.paymentMethod') }}: {{ $t(`owner.paymentMethods.${session.payment?.method || 'NOT_PAID'}`) }}</p>
          <p class="text-sm text-brand-gray-600">{{ formatHours(session.coach.club?.cancellationWindowHours || 24) }} {{ $t('booking.cancellationWindow') }}</p>
          <p class="text-sm text-brand-gray-600">{{ formatHours(session.coach.club?.rescheduleWindowHours || 24) }} {{ $t('booking.rescheduleWindow') }}</p>
          <p class="text-xs text-brand-gray-600">{{ cancelRefundNote(paymentStatus) }}</p>
          <p v-if="actionError" class="canva-flash-error">{{ actionError }}</p>
          <div v-if="session.status !== 'CANCELLED'" class="flex flex-col gap-2 pt-2">
            <button type="button" class="canva-gate-btn-secondary" @click="openReschedule">{{ $t('booking.reschedule') }}</button>
            <button type="button" class="canva-gate-btn-secondary text-brand-primary" @click="requestCancel">{{ $t('booking.cancel') }}</button>
          </div>
        </div>
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
        <select v-model="startTime" class="neo-input bg-white/95" dir="ltr">
          <option v-for="slot in availability?.slots || []" :key="slot.startTime" :value="slot.startTime">
            {{ formatTimeRange(slot.startTime, slot.endTime) }} — {{ formatCurrency(availability?.sessionPrice || session?.price) }}
          </option>
        </select>
        <p v-if="availability && !availability.slots?.length" class="text-sm text-brand-gray-600">{{ t('booking.noSlots') }}</p>
        <button
          type="button"
          class="canva-gate-btn-primary"
          :disabled="!startTime || reschedulePending"
          @click="rescheduleSession"
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
