<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE' })

const route = useRoute()
const localePath = useLocalePath()
const { data, refresh } = await useAuthedFetch('/api/bookings/mine')
const { localizedField } = useLocalizedField()
const { formatCurrency } = useFormatters()
const session = computed(() => data.value?.coachSessions?.find((item: { id: string }) => item.id === route.params.id))
const rescheduleDate = ref(new Date().toISOString().slice(0, 10))
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

watch(availability, (value) => {
  if (value?.slots?.length && !value.slots.some((slot: { startTime: string }) => slot.startTime === startTime.value)) {
    startTime.value = value.slots[0].startTime
  }
})

function bookingStatusLabel(status: string) {
  return useNuxtApp().$i18n.t(`booking.status.${status}`)
}

function paymentStatusLabel(status: string) {
  return useNuxtApp().$i18n.t(`booking.paymentStatus.${status}`)
}

async function cancelSession() {
  if (!session.value || session.value.status === 'CANCELLED') return
  await $fetch(`/api/coach-sessions/${session.value.id}/cancel`, { method: 'PATCH' })
  await refresh()
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
  <div v-if="session" class="space-y-4">
    <PageHeaderNav
      :title="localizedField(session.coach, 'nameFa', 'nameEn')"
      :subtitle="`${session.date} · ${session.startTime}`"
      :home-to="localePath('/')"
      :back-to="localePath('/athlete/bookings')"
    />

    <div class="ios-card space-y-2 p-4">
      <div class="flex flex-wrap gap-2 text-xs">
        <span class="rounded-full bg-brand-cream px-2 py-1 font-bold text-brand-primary">{{ bookingStatusLabel(session.status) }}</span>
        <span class="rounded-full bg-black/5 px-2 py-1 font-bold text-brand-gray-600">{{ paymentStatusLabel(session.payment?.status || session.paymentStatus) }}</span>
      </div>
      <p class="text-xs text-brand-gray-600">{{ $t('booking.reservationId') }}: {{ session.id }}</p>
      <p class="text-sm font-bold">{{ formatCurrency(session.payment?.amount || session.price) }}</p>
      <p class="text-sm text-brand-gray-600">{{ $t('owner.paymentMethod') }}: {{ $t(`owner.paymentMethods.${session.payment?.method || 'NOT_PAID'}`) }}</p>
      <p class="text-sm text-brand-gray-600">{{ session.coach.club?.cancellationWindowHours || 24 }}h {{ $t('booking.cancellationWindow') }}</p>
      <p class="text-sm text-brand-gray-600">{{ session.coach.club?.rescheduleWindowHours || 24 }}h {{ $t('booking.rescheduleWindow') }}</p>
      <div v-if="session.status !== 'CANCELLED'" class="flex flex-wrap gap-2 pt-2">
        <button type="button" class="rounded-xl border px-4 py-2 text-sm font-bold" @click="cancelSession">{{ $t('booking.cancel') }}</button>
        <button type="button" class="btn-primary" @click="loadAvailability">{{ $t('booking.reschedule') }}</button>
      </div>
    </div>

    <div v-if="session.status !== 'CANCELLED'" class="ios-card space-y-3 p-4">
      <h2 class="font-bold">{{ $t('booking.reschedule') }}</h2>
      <input v-model="rescheduleDate" type="date" class="w-full rounded border px-3 py-2" @change="loadAvailability()" />
      <select v-model="startTime" class="w-full rounded border px-3 py-2">
        <option v-for="slot in availability?.slots || []" :key="slot.startTime" :value="slot.startTime">
          {{ slot.startTime }} - {{ slot.endTime }}
        </option>
      </select>
      <p v-if="availability && !availability.slots?.length" class="text-sm text-brand-gray-600">{{ $t('booking.noSlots') }}</p>
      <button type="button" class="btn-primary w-full" :disabled="!startTime" @click="rescheduleSession">{{ $t('booking.confirm') }}</button>
    </div>
  </div>
</template>
