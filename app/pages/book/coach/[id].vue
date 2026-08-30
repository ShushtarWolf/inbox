<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const localePath = useLocalePath()
const id = route.params.id as string
const { user, fetch: fetchAuth } = useAuth()
const { onlineEnabled } = useCheckout()
const { smsPhase, multiReady } = useSmsCapability()
const { formatCurrency, formatTimeRange, formatHours } = useFormatters()
const { today } = useLocalDate()
const { fetchErrorMessage } = useFetchError()

const date = ref(typeof route.query.date === 'string' ? route.query.date : today())
const startTime = ref(typeof route.query.time === 'string' ? route.query.time : '')
const done = ref(false)
const joiningWaitlist = ref(false)
const feedback = ref('')
const feedbackTone = ref<'success' | 'error'>('success')
const bookedPrice = ref<number | null>(null)

type CoachBookingClub = {
  slug?: string
  rescheduleWindowHours?: number | null
}

type CoachBookingDetail = {
  id: string
  nameFa?: string
  nameEn?: string
  sessionPrice?: number
  club?: CoachBookingClub | null
}

type CoachAvailability = {
  sessionPrice?: number
  slots?: Array<{ startTime: string; endTime?: string; available?: boolean }>
}

const { data: coach } = await useFetch<CoachBookingDetail>(`/api/coaches/${id}`)
const { data: availability, pending, error } = await useFetch<CoachAvailability>(`/api/coaches/${id}/availability`, {
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
  if (!onlineEnabled.value) {
    feedbackTone.value = 'error'
    feedback.value = t('booking.onlinePaymentsRequired')
    return
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
    bookedPrice.value = availability.value?.sessionPrice || coach.value?.sessionPrice || null
    done.value = true
    feedbackTone.value = 'success'
    feedback.value = t('booking.successCoachOnline')
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
    <AppDateInput v-model="date" :min-date="today()" />
    <div v-if="coach" class="ios-card p-4 text-sm">
      <p class="font-bold">{{ t('booking.cancellationPolicy') }}</p>
      <p class="mt-1 text-brand-gray-600">{{ formatHours(coach.club?.rescheduleWindowHours || 24) }} {{ t('booking.rescheduleWindow') }}</p>
      <NuxtLink :to="localePath('/cancellation')" class="mt-2 inline-block text-xs font-bold text-brand-primary underline">
        {{ t('legal.cancellation') }}
      </NuxtLink>
    </div>
    <div v-if="feedback && !done" class="ios-card p-4 text-sm" :class="feedbackTone === 'success' ? 'text-brand-primary' : 'text-red-600'">
      {{ feedback }}
    </div>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
      <select v-if="!done" v-model="startTime" dir="ltr" class="neo-input tabular-nums">
        <option v-for="slot in availability?.slots || []" :key="slot.startTime" :value="slot.startTime">{{ formatTimeRange(slot.startTime, slot.endTime) }}</option>
      </select>

      <div v-if="!done && (availability?.sessionPrice || coach?.sessionPrice)" class="ios-card p-4 text-sm">
        <div class="flex items-center justify-between gap-3">
          <span class="font-medium text-brand-gray-600">{{ t('booking.sessionPrice') }}</span>
          <span class="font-bold text-brand-navy">{{ formatCurrency(availability?.sessionPrice || coach?.sessionPrice || 0) }}</span>
        </div>
      </div>

      <BookingCostSummary
        v-if="!done && (availability?.sessionPrice || coach?.sessionPrice)"
        :lines="[
          { label: t('booking.costService'), amount: formatCurrency(availability?.sessionPrice || coach?.sessionPrice || 0) },
          { label: t('booking.costPlatformFee'), amount: t('booking.costPlatformFeeZero'), muted: true },
        ]"
        :total-label="t('booking.costTotal')"
        :total-amount="formatCurrency(availability?.sessionPrice || coach?.sessionPrice || 0)"
        :payment-note="onlineEnabled ? t('booking.costOnlineNote') : t('booking.onlinePaymentsRequired')"
        :cancel-note="t('booking.costCancelHint')"
      />

      <div
        v-if="!done"
        class="venus-sticky-action space-y-2"
      >
        <button
          v-if="availability?.slots?.length"
          type="button"
          class="btn-primary w-full"
          :disabled="!onlineEnabled"
          @click="confirm"
        >{{ onlineEnabled ? t('booking.confirm') : t('booking.onlinePaymentsRequired') }}</button>
        <button v-else type="button" class="w-full btn-ghost w-full" @click="joinWaitlist">
          {{ joiningWaitlist ? t('common.loading') : t('booking.joinWaitlist') }}
        </button>
      </div>
    </AppAsyncState>

    <div v-if="done" class="ios-card space-y-2 p-4 text-center">
      <p class="font-bold text-brand-primary">✓ {{ t('booking.successCoachOnline') }}</p>
      <p
        v-if="!user?.phone?.trim()"
        class="text-sm text-brand-gray-600"
      >
        {{ multiReady ? t('booking.noPhoneSmsNote') : t('booking.noPhoneSmsNoteSingle') }}
        <NuxtLink :to="localePath('/athlete/profile')" class="font-bold text-brand-primary underline">
          {{ t('nav.profile') }}
        </NuxtLink>
      </p>
      <p v-else-if="smsPhase === 'SINGLE'" class="text-sm text-brand-gray-600">
        {{ t('booking.smsDeliveryNoteSingle') }}
      </p>
      <template v-if="onlineEnabled">
        <p class="text-sm text-brand-gray-600">{{ t('booking.payNow') }}</p>
      </template>
      <p v-else class="text-sm text-brand-error">{{ t('booking.onlinePaymentsRequired') }}</p>
      <NuxtLink :to="localePath('/athlete/bookings')" class="btn-primary mt-2 inline-block w-full">{{ t('booking.viewBookings') }}</NuxtLink>
    </div>
  </div>
</template>
