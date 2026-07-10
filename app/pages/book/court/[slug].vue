<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const localePath = useLocalePath()
const slug = route.params.slug as string
const { user, fetch: fetchAuth } = useAuth()
const { localizedField } = useLocalizedField()
const { formatCurrency, formatTimeRange, formatHours } = useFormatters()
const { today } = useLocalDate()
const { fetchErrorMessage } = useFetchError()

const date = ref(typeof route.query.date === 'string' ? route.query.date : today())
const selectedSlot = ref<string | null>(typeof route.query.slot === 'string' ? route.query.slot : null)
const done = ref(false)
const feedback = ref('')
const feedbackTone = ref<'success' | 'error'>('success')

const { data: slots, pending, error, refresh } = await useFetch('/api/slots/available', {
  query: computed(() => ({ club: slug, date: date.value })),
})
const { data: club } = await useFetch(`/api/clubs/${slug}`)
const joiningWaitlist = ref(false)

function syncBookingQuery() {
  router.replace({
    query: {
      ...route.query,
      date: date.value || undefined,
      slot: selectedSlot.value || undefined,
    },
  })
}

watch(date, () => {
  syncBookingQuery()
})

watch(selectedSlot, () => {
  syncBookingQuery()
})

function waitlistWindow() {
  const selected = slots.value?.find((slot: { id: string }) => slot.id === selectedSlot.value)
  if (selected) {
    return { startTime: selected.startTime, endTime: selected.endTime }
  }
  const first = slots.value?.[0]
  if (first) {
    return { startTime: first.startTime, endTime: first.endTime }
  }
  return { startTime: '20:00', endTime: '21:00' }
}

async function confirm() {
  if (!selectedSlot.value) return
  if (!user.value) {
    await navigateTo(localePath({
      path: '/login',
      query: { returnTo: route.fullPath },
    }))
    return
  }
  try {
    await $fetch('/api/bookings/court', { method: 'POST', body: { slotId: selectedSlot.value } })
    done.value = true
    feedbackTone.value = 'success'
    feedback.value = t('booking.successCourt')
    refresh()
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
        clubSlug: slug,
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

onMounted(() => {
  fetchAuth()
  syncBookingQuery()
})
</script>

<template>
  <div class="space-y-4">
    <PageHeaderNav :title="t('home.bookCourt')" :home-to="localePath('/')" :back-to="localePath(`/clubs/${slug}`)" />
    <AppDateInput v-model="date" />
    <div v-if="club" class="ios-card p-4 text-sm">
      <p class="font-bold">{{ t('booking.cancellationPolicy') }}</p>
      <p class="mt-1 text-brand-gray-600">
        {{ formatHours(club.cancellationWindowHours) }} {{ t('booking.cancellationWindow') }} · {{ formatHours(club.rescheduleWindowHours) }} {{ t('booking.rescheduleWindow') }}
      </p>
    </div>

    <AppVenusSkeleton v-if="pending" :lines="3" />
    <p v-else-if="error" class="text-sm text-red-600">{{ t('common.error') }}</p>

    <div v-if="feedback" class="ios-card p-4 text-sm" :class="feedbackTone === 'success' ? 'text-brand-primary' : 'text-red-600'">
      {{ feedback }}
    </div>

    <div v-if="done" class="ios-card space-y-2 p-4 text-center">
      <p class="font-bold text-brand-primary">✓ {{ t('booking.successCourt') }}</p>
      <p class="text-sm font-bold">{{ localizedField(club, 'nameFa', 'nameEn') }}</p>
      <p v-if="club" class="text-sm text-brand-gray-600">{{ localizedField(club, 'addressFa', 'addressEn') }}</p>
      <p class="mt-1 text-sm">{{ t('booking.payAtClub') }}</p>
      <NuxtLink :to="localePath('/athlete/bookings')" class="btn-primary mt-2 inline-block">{{ t('booking.viewBookings') }}</NuxtLink>
    </div>

    <div v-else-if="!pending && !error" class="space-y-2">
      <div v-if="!slots?.length" class="ios-card space-y-2 p-4 text-center">
        <p class="font-bold">{{ t('booking.noSlots') }}</p>
        <button type="button" class="btn-ghost w-full" @click="joinWaitlist">
          {{ joiningWaitlist ? t('common.loading') : t('booking.joinWaitlist') }}
        </button>
      </div>
      <button
        v-for="s in slots"
        :key="s.id"
        type="button"
        class="ios-card w-full p-3 text-start"
        :class="selectedSlot === s.id ? 'ring-2 ring-brand-primary' : ''"
        @click="selectedSlot = s.id"
      >
        <p class="font-bold">{{ localizedField(s.court, 'nameFa', 'nameEn') }}</p>
        <p class="text-sm"><bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(s.startTime, s.endTime) }}</bdi> · {{ formatCurrency(s.price) }}</p>
      </button>
      <button
        v-if="slots?.length"
        type="button"
        class="btn-primary sticky bottom-[calc(var(--sz-tab-bar-height)+var(--sz-safe-bottom)+0.5rem)] z-40 -mx-4 w-[calc(100%+2rem)] bg-brand-cream px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] lg:static lg:mx-0 lg:w-full lg:bg-transparent lg:p-0 lg:shadow-none"
        :disabled="!selectedSlot"
        @click="confirm"
      >
        {{ t('booking.confirm') }}
      </button>
    </div>
  </div>
</template>
