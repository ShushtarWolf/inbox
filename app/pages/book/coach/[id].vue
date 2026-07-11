<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const localePath = useLocalePath()
const id = route.params.id as string
const { user, fetch: fetchAuth } = useAuth()
const { formatTimeRange, formatHours } = useFormatters()
const { today } = useLocalDate()
const { fetchErrorMessage } = useFetchError()

const date = ref(typeof route.query.date === 'string' ? route.query.date : today())
const startTime = ref(typeof route.query.time === 'string' ? route.query.time : '')
const done = ref(false)
const joiningWaitlist = ref(false)
const feedback = ref('')
const feedbackTone = ref<'success' | 'error'>('success')

const { data: coach } = await useFetch(`/api/coaches/${id}`)
const { data: availability, pending, error } = await useFetch(`/api/coaches/${id}/availability`, {
  query: computed(() => ({ date: date.value })),
})

function syncBookingQuery() {
  router.replace({
    query: {
      ...route.query,
      date: date.value || undefined,
      time: startTime.value || undefined,
    },
  })
}

watch(date, () => {
  syncBookingQuery()
})

watch(startTime, () => {
  syncBookingQuery()
})

function selectedAvailabilitySlot() {
  return availability.value?.slots?.find((slot: { startTime: string }) => slot.startTime === startTime.value)
    || availability.value?.slots?.[0]
}

function waitlistWindow() {
  const slot = selectedAvailabilitySlot()
  if (slot) {
    return { startTime: slot.startTime, endTime: slot.endTime }
  }
  return { startTime: '18:00', endTime: '19:00' }
}

async function confirm() {
  if (!user.value) {
    return navigateTo(localePath({
      path: '/login',
      query: { returnTo: route.fullPath },
    }))
  }
  if (!startTime.value) {
    feedbackTone.value = 'error'
    feedback.value = t('booking.selectTime')
    return
  }
  try {
    await $fetch('/api/bookings/coach', {
      method: 'POST',
      body: { coachId: id, date: date.value, startTime: startTime.value },
    })
    done.value = true
    feedbackTone.value = 'success'
    feedback.value = t('booking.successCoach')
  } catch (error: unknown) {
    feedbackTone.value = 'error'
    feedback.value = fetchErrorMessage(error, t('booking.actionFailed'))
  }
}

async function joinWaitlist() {
  joiningWaitlist.value = true
  const window = waitlistWindow()
  try {
    await $fetch('/api/waitlist', {
      method: 'POST',
      body: {
        clubSlug: coach.value?.club?.slug,
        coachId: id,
        date: date.value,
        startTime: window.startTime,
        endTime: window.endTime,
        guestName: user.value?.name,
        guestMobile: user.value?.phone,
      },
    })
    feedbackTone.value = 'success'
    feedback.value = t('booking.waitlistJoined')
  } catch (error: unknown) {
    feedbackTone.value = 'error'
    feedback.value = fetchErrorMessage(error, t('booking.actionFailed'))
  } finally {
    joiningWaitlist.value = false
  }
}

watch(availability, () => {
  if (!startTime.value || !availability.value?.slots?.some((slot: { startTime: string }) => slot.startTime === startTime.value)) {
    startTime.value = availability.value?.slots?.[0]?.startTime || ''
  }
}, { immediate: true })

onMounted(() => {
  fetchAuth()
  syncBookingQuery()
})
</script>

<template>
  <div class="venus-page-stack">
    <PageHeaderNav :title="t('home.findCoach')" :home-to="localePath('/')" :back-to="localePath(`/coaches/${id}`)" />
    <AppDateInput v-model="date" />
    <div v-if="coach" class="ios-card p-4 text-sm">
      <p class="font-bold">{{ t('booking.cancellationPolicy') }}</p>
      <p class="mt-1 text-brand-gray-600">{{ formatHours(coach.club?.rescheduleWindowHours || 24) }} {{ t('booking.rescheduleWindow') }}</p>
    </div>
    <div v-if="feedback && !done" class="ios-card p-4 text-sm" :class="feedbackTone === 'success' ? 'text-brand-primary' : 'text-red-600'">
      {{ feedback }}
    </div>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
      <select v-if="!done" v-model="startTime" dir="ltr" class="neo-input tabular-nums">
        <option v-for="slot in availability?.slots || []" :key="slot.startTime" :value="slot.startTime">{{ formatTimeRange(slot.startTime, slot.endTime) }}</option>
      </select>

      <div
        v-if="!done"
        class="venus-sticky-action space-y-2"
      >
        <button v-if="availability?.slots?.length" type="button" class="btn-primary w-full" @click="confirm">{{ t('booking.confirm') }}</button>
        <button v-else type="button" class="w-full btn-ghost w-full" @click="joinWaitlist">
          {{ joiningWaitlist ? t('common.loading') : t('booking.joinWaitlist') }}
        </button>
      </div>
    </AppAsyncState>

    <div v-if="done" class="ios-card p-4 text-center">
      <p class="font-bold text-brand-primary">✓ {{ t('booking.successCoach') }}</p>
      <p class="mt-1 text-sm">{{ t('booking.payAtClub') }}</p>
    </div>
  </div>
</template>
