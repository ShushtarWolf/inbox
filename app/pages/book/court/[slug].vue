<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const localePath = useLocalePath()
const slug = route.params.slug as string
const { user, fetch: fetchAuth } = useAuth()
const { openLogin } = useAuthFlow()
const { localizedField } = useLocalizedField()
const { formatCurrency, formatTimeRange, formatHours } = useFormatters()
const { today } = useLocalDate()
const { fetchErrorMessage } = useFetchError()

const date = ref(typeof route.query.date === 'string' ? route.query.date : today())
const selectedSlot = ref<string | null>(typeof route.query.slot === 'string' ? route.query.slot : null)
const selectedCourtId = ref<string | null>(typeof route.query.court === 'string' ? route.query.court : null)
const done = ref(false)
const createdBookingId = ref<string | null>(null)
const bookedPrice = ref<number | null>(null)
const paying = ref(false)
const confirming = ref(false)
const feedback = ref('')
const feedbackTone = ref<'success' | 'error'>('success')
const lastPaymentStatus = ref<string | null>(null)
const { onlineEnabled, isTestPayments, startCheckout, canPayOnline } = useCheckout()
const { data: wallet } = await useAuthedFetch('/api/wallet', { lazy: true })
const { smsPhase, multiReady } = useSmsCapability()

const { data: slots, pending, error, refresh } = await useFetch('/api/slots/available', {
  query: computed(() => ({ club: slug, date: date.value })),
})
const { data: club } = await useFetch(`/api/clubs/${slug}`)
const joiningWaitlist = ref(false)

const visibleSlots = computed(() => {
  const list = slots.value || []
  if (!selectedCourtId.value) return list
  return list.filter((slot: { courtId?: string; court?: { id?: string } }) =>
    slot.courtId === selectedCourtId.value || slot.court?.id === selectedCourtId.value,
  )
})

const selectedSlotProp = computed(() =>
  visibleSlots.value.find((slot: { id: string; price?: number }) => slot.id === selectedSlot.value)
  || slots.value?.find((slot: { id: string; price?: number }) => slot.id === selectedSlot.value)
  || null,
)

const costLines = computed(() => {
  const price = selectedSlotProp.value?.price
  if (price == null) return []
  return [
    { label: t('booking.costService'), amount: formatCurrency(price) },
    { label: t('booking.costPlatformFee'), amount: t('booking.costPlatformFeeZero'), muted: true },
  ]
})

function syncBookingQuery() {
  router.replace({
    query: {
      ...route.query,
      date: date.value || undefined,
      slot: selectedSlot.value || undefined,
      court: selectedCourtId.value || undefined,
    },
  })
}

watch(date, () => {
  syncBookingQuery()
})

watch(selectedSlot, (slotId) => {
  const row = slots.value?.find((slot: { id: string; courtId?: string; court?: { id?: string } }) => slot.id === slotId)
  if (row) {
    selectedCourtId.value = row.courtId || row.court?.id || selectedCourtId.value
  }
  syncBookingQuery()
})

watch(visibleSlots, (list) => {
  if (!selectedSlot.value) return
  if (!list.some((slot: { id: string }) => slot.id === selectedSlot.value)) {
    selectedSlot.value = null
  }
})

function waitlistWindow() {
  const selected = slots.value?.find((slot: { id: string }) => slot.id === selectedSlot.value)
  if (selected) {
    return { startTime: selected.startTime, endTime: selected.endTime }
  }
  const first = visibleSlots.value[0] || slots.value?.[0]
  if (first) {
    return { startTime: first.startTime, endTime: first.endTime }
  }
  return { startTime: '20:00', endTime: '21:00' }
}

async function confirm() {
  if (!selectedSlot.value || confirming.value) return
  if (!user.value) {
    openLogin({ returnTo: route.fullPath })
    return
  }
  confirming.value = true
  try {
    const selected = slots.value?.find((slot: { id: string; price?: number }) => slot.id === selectedSlot.value)
    const result = await $fetch<{ id: string; paymentStatus: string }>('/api/bookings/court', {
      method: 'POST',
      body: { slotId: selectedSlot.value },
    })
    createdBookingId.value = result.id
    lastPaymentStatus.value = result.paymentStatus
    bookedPrice.value = selected?.price ?? null
    done.value = true
    feedbackTone.value = 'success'
    feedback.value = onlineEnabled.value ? t('booking.successCourtOnline') : t('booking.successCourt')
    refresh()

    // Online modes: auto-redirect to IPG / test-gateway; pay_at_club stays on success sheet.
    if (onlineEnabled.value && canPayOnline(result.paymentStatus)) {
      paying.value = true
      try {
        await startCheckout({ bookingId: result.id })
      } catch (checkoutError: unknown) {
        feedbackTone.value = 'error'
        feedback.value = fetchErrorMessage(checkoutError, t('booking.paymentError'))
      } finally {
        paying.value = false
      }
    }
  } catch (error: unknown) {
    feedbackTone.value = 'error'
    feedback.value = fetchErrorMessage(error, t('booking.actionFailed'))
  } finally {
    confirming.value = false
  }
}

async function joinWaitlist() {
  if (!user.value) {
    openLogin({ returnTo: route.fullPath })
    return
  }
  joiningWaitlist.value = true
  const window = waitlistWindow()
  const selected = slots.value?.find((slot: { id: string; courtId?: string }) => slot.id === selectedSlot.value)
  try {
    await $fetch('/api/waitlist', {
      method: 'POST',
      body: {
        clubSlug: slug,
        date: date.value,
        startTime: window.startTime,
        endTime: window.endTime,
        courtId: selected?.courtId || selectedCourtId.value || undefined,
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

async function payNow() {
  if (!createdBookingId.value) return
  paying.value = true
  try {
    await startCheckout({ bookingId: createdBookingId.value })
    feedbackTone.value = 'success'
    feedback.value = t('booking.payNow')
  } catch (error: unknown) {
    feedbackTone.value = 'error'
    feedback.value = fetchErrorMessage(error, t('booking.actionFailed'))
  } finally {
    paying.value = false
  }
}

async function payWithWallet() {
  if (!createdBookingId.value) return
  paying.value = true
  try {
    await startCheckout({ bookingId: createdBookingId.value, useWallet: true })
    feedbackTone.value = 'success'
    feedback.value = t('booking.walletPaidSuccess')
  } catch (error: unknown) {
    feedbackTone.value = 'error'
    feedback.value = fetchErrorMessage(error, t('booking.actionFailed'))
  } finally {
    paying.value = false
  }
}

onMounted(() => {
  fetchAuth()
  syncBookingQuery()
})
</script>

<template>
  <div class="venus-page-stack">
    <section class="canva-dash-hero">
      <p class="text-xs text-white/80">{{ t('home.bookCourt') }}</p>
      <h1 class="mt-1 text-2xl font-bold">{{ localizedField(club, 'nameFa', 'nameEn') || t('home.bookCourt') }}</h1>
    </section>
    <AppDateInput v-model="date" :min-date="today()" />
    <div v-if="club" class="canva-panel text-sm">
      <p class="font-bold text-brand-navy">{{ t('booking.cancellationPolicy') }}</p>
      <p class="mt-1 text-brand-gray-600">
        {{ formatHours(club.cancellationWindowHours) }} {{ t('booking.cancellationWindow') }} · {{ formatHours(club.rescheduleWindowHours) }} {{ t('booking.rescheduleWindow') }}
      </p>
      <NuxtLink :to="localePath('/cancellation')" class="mt-2 inline-block text-xs font-bold text-brand-primary underline">
        {{ t('legal.cancellation') }}
      </NuxtLink>
    </div>

    <div v-if="feedback && !done" :class="feedbackTone === 'success' ? 'canva-flash-success' : 'canva-flash-error'">
      {{ feedback }}
    </div>

    <div v-if="done" class="canva-result-sheet p-5 text-center">
      <div class="relative z-[1] space-y-2 px-1 pb-2 pt-2">
        <p class="text-lg font-bold text-brand-primary">✓ {{ onlineEnabled ? t('booking.successCourtOnline') : t('booking.successCourt') }}</p>
        <p v-if="!user?.phone?.trim()" class="text-sm text-brand-gray-600">
          {{ multiReady ? t('booking.noPhoneSmsNote') : t('booking.noPhoneSmsNoteSingle') }}
          <NuxtLink :to="localePath('/athlete/profile')" class="font-bold text-brand-primary underline">{{ t('nav.profile') }}</NuxtLink>
        </p>
        <p v-else-if="smsPhase === 'SINGLE'" class="text-sm text-brand-gray-600">
          {{ t('booking.smsDeliveryNoteSingle') }}
        </p>
        <p v-else class="text-sm text-brand-gray-600">
          {{ t('booking.smsDeliveryNoteMulti') }}
        </p>
        <p class="text-sm font-bold text-brand-navy">{{ localizedField(club, 'nameFa', 'nameEn') }}</p>
        <p v-if="club" class="text-sm text-brand-gray-600">{{ localizedField(club, 'addressFa', 'addressEn') }}</p>
        <template v-if="!onlineEnabled">
          <p class="mt-1 text-sm font-bold text-start">{{ t('booking.payAtClub') }}</p>
          <p class="text-sm text-brand-gray-600 text-start">{{ t('booking.payAtClubDetail') }}</p>
          <p v-if="bookedPrice != null" class="text-sm font-bold text-start">{{ t('booking.payAtClubAmount', { amount: formatCurrency(bookedPrice) }) }}</p>
          <button v-if="(wallet?.balance || 0) > 0" type="button" class="canva-gate-btn-secondary mt-2 w-full" :disabled="paying" @click="payWithWallet">
            {{ paying ? t('common.loading') : `${t('booking.payWithWallet')} (${formatCurrency(wallet?.balance || 0)})` }}
          </button>
        </template>
        <div v-else class="mt-2 space-y-2">
          <p class="text-sm font-bold text-brand-navy text-start">{{ t('booking.payNow') }}</p>
          <p class="text-sm text-brand-gray-600 text-start">
            {{ isTestPayments ? t('booking.onlinePayTestHint') : t('booking.onlinePayHint') }}
          </p>
          <p v-if="bookedPrice != null" class="text-sm font-bold text-start">{{ t('booking.payOnlineAmount', { amount: formatCurrency(bookedPrice) }) }}</p>
          <p v-if="feedbackTone === 'error'" class="canva-flash-error text-start">{{ feedback }}</p>
          <button type="button" class="canva-gate-btn-primary w-full" :disabled="paying" @click="payNow">
            {{ paying ? t('common.loading') : (lastPaymentStatus === 'FAILED' ? t('booking.payRetry') : t('booking.payNow')) }}
          </button>
          <button v-if="(wallet?.balance || 0) > 0" type="button" class="canva-gate-btn-secondary w-full" :disabled="paying" @click="payWithWallet">
            {{ t('booking.payWithWallet') }} ({{ formatCurrency(wallet?.balance || 0) }})
          </button>
        </div>
        <NuxtLink :to="localePath('/athlete/bookings')" class="canva-gate-btn-primary mt-2 inline-block w-full">{{ t('booking.viewBookings') }}</NuxtLink>
        <NuxtLink :to="localePath('/clubs')" class="btn-ghost mt-1 inline-block w-full">{{ t('booking.bookAgain') }}</NuxtLink>
      </div>
    </div>

    <AppAsyncState v-else :pending="pending" :error="error" skeleton-variant="default">
      <div class="venus-booking-slots">
        <div v-if="!visibleSlots.length" class="canva-panel space-y-2 text-center">
          <p class="font-bold text-brand-navy">{{ t('booking.noSlots') }}</p>
          <button type="button" class="canva-gate-btn-secondary w-full" @click="joinWaitlist">
            {{ joiningWaitlist ? t('common.loading') : t('booking.joinWaitlist') }}
          </button>
        </div>
        <button
          v-for="s in visibleSlots"
          :key="s.id"
          type="button"
          class="canva-list-card w-full text-start"
          :class="selectedSlot === s.id ? 'border-brand-primary ring-2 ring-brand-primary/30' : ''"
          @click="selectedSlot = s.id"
        >
          <p class="font-bold text-brand-navy">{{ localizedField(s.court, 'nameFa', 'nameEn') }}</p>
          <p class="text-sm"><bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(s.startTime, s.endTime) }}</bdi> · {{ formatCurrency(s.price) }}</p>
        </button>
        <BookingCostSummary
          v-if="selectedSlotProp && costLines.length"
          :lines="costLines"
          :total-label="t('booking.costTotal')"
          :total-amount="formatCurrency(selectedSlotProp.price || 0)"
          :payment-note="onlineEnabled ? t('booking.costOnlineNote') : t('booking.costPayAtClubNote')"
          :cancel-note="t('booking.costCancelHint')"
        />
        <button
          v-if="visibleSlots.length"
          type="button"
          class="canva-gate-btn-primary venus-sticky-action w-full lg:w-full"
          :disabled="!selectedSlot || confirming"
          @click="confirm"
        >
          {{ confirming ? t('common.loading') : t('booking.confirm') }}
        </button>
      </div>
    </AppAsyncState>
  </div>
</template>
