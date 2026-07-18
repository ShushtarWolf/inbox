<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE' , ssr: false})

interface CourtBooking {
  id: string
  status: string
  payment?: { status?: string } | null
  paymentStatus?: string | null
  slot: {
    date: string
    startTime: string
    court: {
      club: {
        slug: string
        nameFa: string
        nameEn: string
        cancellationWindowHours: number
      }
    }
  }
}

const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatTimeRange, formatHours, formatIsoDate } = useFormatters()
const { today } = useLocalDate()
const { fetchErrorMessage } = useFetchError()
const { data, pending, error, refresh } = await useAuthedFetch('/api/bookings/mine')
const { onlineEnabled, startCheckout, canPayOnline } = useCheckout()
const {
  bookingStatusLabel,
  paymentStatusLabel,
  bookingStatusBadgeClass,
  paymentStatusBadgeClass,
  isPayAtClubStatus,
} = useBookingLabels()
const payingId = ref<string | null>(null)
const actionError = ref('')
const rescheduleTarget = ref<CourtBooking | null>(null)
const rescheduleDate = ref(today())
const rescheduleSlotId = ref('')

const { data: replacementSlots, refresh: refreshSlots } = await useAuthedFetch('/api/slots/available', {
  query: computed(() => ({
    club: rescheduleTarget.value?.slot?.court?.club?.slug,
    date: rescheduleDate.value,
  })),
  immediate: false,
})

async function openReschedule(booking: CourtBooking) {
  actionError.value = ''
  rescheduleTarget.value = booking
  rescheduleDate.value = booking.slot.date
  await refreshSlots()
}

function closeReschedule() {
  rescheduleTarget.value = null
  rescheduleSlotId.value = ''
}

async function cancel(id: string) {
  if (!confirm(t('booking.confirmCancel'))) return
  actionError.value = ''
  try {
    const result = await $fetch<{ refund?: { walletCredited?: boolean } }>(`/api/bookings/${id}/cancel`, { method: 'PATCH' })
    if (result.refund?.walletCredited) {
      alert(t('booking.refundToWallet'))
    }
    refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  }
}

async function cancelCoach(sessionId: string) {
  if (!confirm(t('booking.confirmCancel'))) return
  actionError.value = ''
  try {
    const result = await $fetch<{ refund?: { walletCredited?: boolean } }>(`/api/coach-sessions/${sessionId}/cancel`, { method: 'PATCH' })
    if (result.refund?.walletCredited) {
      alert(t('booking.refundToWallet'))
    }
    refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  }
}

async function cancelPackage(id: string) {
  if (!confirm(t('booking.confirmCancel'))) return
  actionError.value = ''
  try {
    const result = await $fetch<{ refund?: { walletCredited?: boolean } }>(`/api/package-bookings/${id}/cancel`, { method: 'PATCH' })
    if (result.refund?.walletCredited) {
      alert(t('booking.refundToWallet'))
    }
    refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  }
}

async function payBooking(bookingId: string, useWallet = false) {
  payingId.value = bookingId
  actionError.value = ''
  try {
    await startCheckout({ bookingId, useWallet })
    await refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  } finally {
    payingId.value = null
  }
}

async function payCoach(sessionId: string, useWallet = false) {
  payingId.value = sessionId
  actionError.value = ''
  try {
    await startCheckout({ coachSessionId: sessionId, useWallet })
    await refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  } finally {
    payingId.value = null
  }
}

async function payPackage(packageBookingId: string, useWallet = false) {
  payingId.value = packageBookingId
  actionError.value = ''
  try {
    await startCheckout({ packageBookingId, useWallet })
    await refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  } finally {
    payingId.value = null
  }
}

async function rescheduleCourt() {
  if (!rescheduleTarget.value || !rescheduleSlotId.value) return
  actionError.value = ''
  try {
    await $fetch(`/api/bookings/${rescheduleTarget.value.id}/reschedule`, {
      method: 'PATCH',
      body: { slotId: rescheduleSlotId.value },
    })
    closeReschedule()
    refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  }
}

watch(rescheduleDate, () => {
  if (rescheduleTarget.value) refreshSlots()
})

const hasAnyBookings = computed(() =>
  Boolean(data.value?.courtBookings?.length || data.value?.coachSessions?.length || data.value?.packageBookings?.length),
)

function paymentOf(item: { payment?: { status?: string } | null, paymentStatus?: string | null }) {
  return item.payment?.status || item.paymentStatus
}
</script>

<template>
  <div class="venus-page-stack">
    <PageHeaderNav :title="$t('nav.bookings')" :show-actions="false" />

    <NuxtLink :to="localePath('/clubs')" class="btn-ghost block text-center text-sm">{{ t('athlete.bookCourtCta') }}</NuxtLink>

    <p v-if="actionError" class="ios-card p-3 text-sm text-red-600">{{ actionError }}</p>

    <AppAsyncState :pending="pending" :error="error" :empty="Boolean(data) && !hasAnyBookings" skeleton-variant="table">
    <section v-if="data?.courtBookings?.length" class="space-y-2">
      <h2 class="text-sm font-bold text-brand-gray-600">{{ t('booking.courtsSection') }}</h2>
      <div v-for="b in data.courtBookings" :key="b.id" class="ios-card p-3">
        <p class="font-bold">{{ localizedField(b.slot.court.club, 'nameFa', 'nameEn') }}</p>
        <p class="text-sm" dir="auto">{{ formatIsoDate(b.slot.date) }} <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(b.slot.startTime) }}</bdi></p>
        <div class="mt-2 flex flex-wrap gap-2 text-xs">
          <span class="neo-badge" :class="bookingStatusBadgeClass(b.status)">{{ bookingStatusLabel(b.status) }}</span>
          <span class="neo-badge" :class="paymentStatusBadgeClass(paymentOf(b))">{{ paymentStatusLabel(paymentOf(b)) }}</span>
        </div>
        <p v-if="b.status !== 'CANCELLED' && isPayAtClubStatus(paymentOf(b))" class="mt-2 text-xs text-brand-gray-600">{{ t('booking.payAtClubDetail') }}</p>
        <p class="mt-2 text-xs text-brand-gray-600">{{ formatHours(b.slot.court.club.cancellationWindowHours) }} {{ t('booking.cancellationWindow') }}</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <NuxtLink :to="localePath(`/athlete/bookings/${b.id}`)" class="text-xs font-bold text-brand-primary">{{ t('common.detail') }}</NuxtLink>
          <button
            v-if="b.status !== 'CANCELLED' && onlineEnabled && canPayOnline(paymentOf(b))"
            type="button"
            class="text-xs font-bold text-brand-primary"
            :disabled="payingId === b.id"
            @click="payBooking(b.id)"
          >
            {{ t('booking.payNow') }}
          </button>
          <button v-if="b.status !== 'CANCELLED'" type="button" class="text-xs font-bold text-brand-gray-600" @click="openReschedule(b)">
            {{ t('booking.reschedule') }}
          </button>
          <button v-if="b.status !== 'CANCELLED'" type="button" class="text-xs font-bold text-brand-gray-600" @click="cancel(b.id)">
            {{ $t('booking.cancel') }}
          </button>
        </div>
      </div>
    </section>

    <section v-if="data?.coachSessions?.length" class="space-y-2">
      <h2 class="text-sm font-bold text-brand-gray-600">{{ t('booking.coachSection') }}</h2>
      <div v-for="s in data.coachSessions" :key="s.id" class="ios-card p-3">
        <p class="font-bold">{{ localizedField(s.coach, 'nameFa', 'nameEn') }}</p>
        <p class="text-sm" dir="auto">{{ formatIsoDate(s.date) }} <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(s.startTime) }}</bdi></p>
        <div class="mt-2 flex flex-wrap gap-2 text-xs">
          <span class="neo-badge" :class="bookingStatusBadgeClass(s.status)">{{ bookingStatusLabel(s.status) }}</span>
          <span class="neo-badge" :class="paymentStatusBadgeClass(paymentOf(s))">{{ paymentStatusLabel(paymentOf(s)) }}</span>
        </div>
        <p v-if="s.status !== 'CANCELLED' && isPayAtClubStatus(paymentOf(s))" class="mt-2 text-xs text-brand-gray-600">{{ t('booking.payAtClubDetail') }}</p>
        <p class="mt-2 text-xs text-brand-gray-600">{{ formatHours(s.coach.club?.cancellationWindowHours || 24) }} {{ t('booking.cancellationWindow') }}</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <NuxtLink :to="localePath(`/athlete/bookings/coach/${s.id}`)" class="text-xs font-bold text-brand-primary">{{ t('common.detail') }}</NuxtLink>
          <button
            v-if="s.status !== 'CANCELLED' && onlineEnabled && canPayOnline(paymentOf(s))"
            type="button"
            class="text-xs font-bold text-brand-primary"
            :disabled="payingId === s.id"
            @click="payCoach(s.id)"
          >
            {{ t('booking.payNow') }}
          </button>
          <button v-if="s.status !== 'CANCELLED'" type="button" class="text-xs font-bold text-brand-gray-600" @click="cancelCoach(s.id)">
            {{ t('booking.cancel') }}
          </button>
        </div>
      </div>
    </section>

    <section v-if="data?.packageBookings?.length" class="space-y-2">
      <h2 class="text-sm font-bold text-brand-gray-600">{{ t('booking.packageSection') }}</h2>
      <div v-for="b in data.packageBookings" :key="b.id" class="ios-card p-3">
        <p class="font-bold">{{ b.package.title }}</p>
        <p class="text-sm text-brand-gray-600">{{ localizedField(b.package.club, 'nameFa', 'nameEn') }}</p>
        <div class="mt-2 flex flex-wrap gap-2 text-xs">
          <span class="neo-badge" :class="bookingStatusBadgeClass(b.status)">{{ bookingStatusLabel(b.status) }}</span>
          <span class="neo-badge" :class="paymentStatusBadgeClass(paymentOf(b))">{{ paymentStatusLabel(paymentOf(b)) }}</span>
        </div>
        <div class="mt-2 flex flex-wrap gap-2">
          <button
            v-if="b.status !== 'CANCELLED' && onlineEnabled && canPayOnline(paymentOf(b))"
            type="button"
            class="text-xs font-bold text-brand-primary"
            :disabled="payingId === b.id"
            @click="payPackage(b.id)"
          >
            {{ t('booking.payNow') }}
          </button>
          <button v-if="b.status !== 'CANCELLED'" type="button" class="text-xs font-bold text-brand-gray-600" @click="cancelPackage(b.id)">
            {{ t('booking.cancel') }}
          </button>
        </div>
      </div>
    </section>

    <template #empty>
      <div class="ios-card space-y-3 p-4 text-center text-sm text-brand-gray-600">
        <p>{{ t('booking.emptyState') }}</p>
        <NuxtLink :to="localePath('/clubs')" class="btn-primary inline-block">{{ t('booking.emptyStateCta') }}</NuxtLink>
      </div>
    </template>
    </AppAsyncState>

    <AppModal :open="Boolean(rescheduleTarget)" :title="t('booking.reschedule')" @close="closeReschedule">
      <div class="venus-modal-shell venus-modal-shell-simple">
        <div class="venus-modal-panel">
          <div class="venus-modal-panel-body venus-form-stack">
            <AppDateInput v-model="rescheduleDate" :min-date="today()" />
            <div class="max-h-64 space-y-2 overflow-auto">
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
          </div>
          <div class="venus-modal-footer">
            <div class="flex gap-3">
              <button type="button" class="btn-primary flex-1" :disabled="!rescheduleSlotId" @click="rescheduleCourt">{{ t('booking.confirm') }}</button>
              <button type="button" class="btn-ghost flex-1" @click="closeReschedule">{{ t('common.close') }}</button>
            </div>
          </div>
        </div>
      </div>
    </AppModal>
  </div>
</template>
