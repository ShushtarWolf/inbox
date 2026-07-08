<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE' })

const { t } = useI18n()
const localePath = useLocalePath()
const { data, refresh } = await useAuthedFetch('/api/bookings/mine')
const { localizedField } = useLocalizedField()
const rescheduleTarget = ref<any>(null)
const rescheduleDate = ref(new Date().toISOString().slice(0, 10))
const rescheduleSlotId = ref('')
const coachRescheduleDate = ref(new Date().toISOString().slice(0, 10))
const coachRescheduleTime = ref('')

const { data: replacementSlots, refresh: refreshSlots } = await useAuthedFetch('/api/slots/available', {
  query: computed(() => ({
    club: rescheduleTarget.value?.slot?.court?.club?.slug,
    date: rescheduleDate.value,
  })),
  immediate: false,
})

async function openReschedule(booking: any) {
  rescheduleTarget.value = booking
  rescheduleDate.value = booking.slot.date
  await refreshSlots()
}

async function cancel(id: string) {
  await $fetch(`/api/bookings/${id}/cancel`, { method: 'PATCH' })
  refresh()
}

async function rescheduleCourt() {
  if (!rescheduleTarget.value || !rescheduleSlotId.value) return
  await $fetch(`/api/bookings/${rescheduleTarget.value.id}/reschedule`, {
    method: 'PATCH',
    body: { slotId: rescheduleSlotId.value },
  })
  rescheduleTarget.value = null
  rescheduleSlotId.value = ''
  refresh()
}

async function rescheduleCoach(sessionId: string) {
  if (!coachRescheduleTime.value) return
  await $fetch(`/api/coach-sessions/${sessionId}/reschedule`, {
    method: 'PATCH',
    body: {
      date: coachRescheduleDate.value,
      startTime: coachRescheduleTime.value,
    },
  })
  coachRescheduleTime.value = ''
  refresh()
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="font-display text-xl font-black">{{ $t('nav.bookings') }}</h1>

    <section v-if="data?.courtBookings?.length" class="space-y-2">
      <h2 class="text-sm font-bold text-brand-gray-600">{{ t('booking.courtsSection') }}</h2>
      <div v-for="b in data.courtBookings" :key="b.id" class="ios-card p-3">
        <p class="font-bold">{{ localizedField(b.slot.court.club, 'nameFa', 'nameEn') }}</p>
        <p class="text-sm">{{ b.slot.date }} {{ b.slot.startTime }}</p>
        <p class="text-xs text-brand-gray-600">{{ b.slot.court.club.cancellationWindowHours }}h {{ t('booking.cancellationWindow') }}</p>
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
        <p class="text-sm">{{ s.date }} {{ s.startTime }}</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <input v-model="coachRescheduleDate" type="date" class="rounded border px-2 py-1 text-xs" />
          <input v-model="coachRescheduleTime" type="time" class="rounded border px-2 py-1 text-xs" />
          <button type="button" class="text-xs font-bold text-brand-primary" @click="rescheduleCoach(s.id)">{{ t('booking.reschedule') }}</button>
        </div>
      </div>
    </section>

    <div v-if="rescheduleTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="rescheduleTarget = null">
      <div class="w-full max-w-md rounded-2xl bg-white p-4">
        <h2 class="mb-3 font-bold">{{ t('booking.reschedule') }}</h2>
        <input v-model="rescheduleDate" type="date" class="mb-3 w-full rounded border px-3 py-2" @change="refreshSlots()" />
        <div class="max-h-64 space-y-2 overflow-auto">
          <button
            v-for="slot in replacementSlots"
            :key="slot.id"
            type="button"
            class="w-full rounded-xl border px-3 py-2 text-start text-sm"
            :class="rescheduleSlotId === slot.id ? 'border-brand-primary text-brand-primary' : ''"
            @click="rescheduleSlotId = slot.id"
          >
            {{ localizedField(slot.court, 'nameFa', 'nameEn') }} · {{ slot.startTime }}
          </button>
        </div>
        <div class="mt-4 flex gap-2">
          <button type="button" class="btn-primary flex-1" :disabled="!rescheduleSlotId" @click="rescheduleCourt">{{ t('booking.confirm') }}</button>
          <button type="button" class="flex-1 rounded-xl border px-4 py-3 text-sm font-bold" @click="rescheduleTarget = null">{{ t('common.close') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
