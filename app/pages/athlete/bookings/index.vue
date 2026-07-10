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
const { data, pending, error, refresh } = await useAuthedFetch('/api/bookings/mine')
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
  await $fetch(`/api/bookings/${id}/cancel`, { method: 'PATCH' })
  refresh()
}

async function cancelCoach(sessionId: string) {
  if (!confirm(t('booking.confirmCancel'))) return
  await $fetch(`/api/coach-sessions/${sessionId}/cancel`, { method: 'PATCH' })
  refresh()
}

async function rescheduleCourt() {
  if (!rescheduleTarget.value || !rescheduleSlotId.value) return
  await $fetch(`/api/bookings/${rescheduleTarget.value.id}/reschedule`, {
    method: 'PATCH',
    body: { slotId: rescheduleSlotId.value },
  })
  closeReschedule()
  refresh()
}

watch(rescheduleDate, () => {
  if (rescheduleTarget.value) refreshSlots()
})

function bookingStatusLabel(status: string) {
  return t(`booking.status.${status}`)
}

function paymentStatusLabel(status: string) {
  return t(`booking.paymentStatus.${status}`)
}
</script>

<template>
  <div class="space-y-4">
    <PageHeaderNav :title="$t('nav.bookings')" :home-to="localePath('/')" :back-to="localePath('/athlete')" />

    <p v-if="pending" class="text-sm text-brand-gray-600">{{ t('common.loading') }}</p>
    <p v-else-if="error" class="text-sm text-red-600">{{ t('common.error') }}</p>

    <section v-if="data?.courtBookings?.length" class="space-y-2">
      <h2 class="text-sm font-bold text-brand-gray-600">{{ t('booking.courtsSection') }}</h2>
      <div v-for="b in data.courtBookings" :key="b.id" class="ios-card p-3">
        <p class="font-bold">{{ localizedField(b.slot.court.club, 'nameFa', 'nameEn') }}</p>
        <p class="text-sm" dir="auto">{{ formatIsoDate(b.slot.date) }} <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(b.slot.startTime) }}</bdi></p>
        <div class="mt-2 flex flex-wrap gap-2 text-xs">
          <span class="rounded-full bg-brand-cream px-2 py-1 font-bold text-brand-primary">{{ bookingStatusLabel(b.status) }}</span>
          <span class="rounded-full bg-black/5 px-2 py-1 font-bold text-brand-gray-600">{{ paymentStatusLabel(b.payment?.status || b.paymentStatus) }}</span>
        </div>
        <p class="mt-2 text-xs text-brand-gray-600">{{ formatHours(b.slot.court.club.cancellationWindowHours) }} {{ t('booking.cancellationWindow') }}</p>
        <div class="mt-2 flex gap-2">
          <NuxtLink :to="localePath(`/athlete/bookings/${b.id}`)" class="text-xs font-bold text-brand-primary">{{ t('common.detail') }}</NuxtLink>
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
          <span class="rounded-full bg-brand-cream px-2 py-1 font-bold text-brand-primary">{{ bookingStatusLabel(s.status) }}</span>
          <span class="rounded-full bg-black/5 px-2 py-1 font-bold text-brand-gray-600">{{ paymentStatusLabel(s.payment?.status || s.paymentStatus) }}</span>
        </div>
        <p class="mt-2 text-xs text-brand-gray-600">{{ formatHours(s.coach.club?.cancellationWindowHours || 24) }} {{ t('booking.cancellationWindow') }}</p>
        <div class="mt-2 flex gap-2">
          <NuxtLink :to="localePath(`/athlete/bookings/coach/${s.id}`)" class="text-xs font-bold text-brand-primary">{{ t('common.detail') }}</NuxtLink>
          <button v-if="s.status !== 'CANCELLED'" type="button" class="text-xs font-bold text-brand-gray-600" @click="cancelCoach(s.id)">
            {{ t('booking.cancel') }}
          </button>
        </div>
      </div>
    </section>

    <div v-if="!pending && !error && !data?.courtBookings?.length && !data?.coachSessions?.length" class="ios-card p-4 text-sm text-brand-gray-600">
      {{ t('booking.emptyState') }}
    </div>

    <AppModal :open="Boolean(rescheduleTarget)" :title="t('booking.reschedule')" @close="closeReschedule">
      <div class="rounded-2xl bg-white p-4">
        <AppDateInput v-model="rescheduleDate" class="mb-3" />
        <div class="max-h-64 space-y-2 overflow-auto">
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
        <div class="mt-4 flex gap-2">
          <button type="button" class="btn-primary flex-1" :disabled="!rescheduleSlotId" @click="rescheduleCourt">{{ t('booking.confirm') }}</button>
          <button type="button" class="flex-1 rounded-xl border px-4 py-3 text-sm font-bold" @click="closeReschedule">{{ t('common.close') }}</button>
        </div>
      </div>
    </AppModal>
  </div>
</template>
