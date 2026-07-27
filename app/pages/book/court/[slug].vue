<script setup lang="ts">
/**
 * Deep-link / fallback court booking page.
 * Primary UX is the confirm sheet on `/clubs/[slug]` — keep this route for
 * shared links and older bookmarks.
 */
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
const {
  confirming,
  paying,
  feedback,
  feedbackTone,
  lastPaymentStatus,
  bookedTotal,
  done,
  onlineEnabled,
  createCourtBookings,
  payBooking,
  payBookingWithWallet,
  primaryCtaLabel,
} = useCourtBooking()
const { canCoverWithWallet, isTestPayments } = useCheckout()
const { data: wallet } = await useAuthedFetch('/api/wallet', { lazy: true })
const { smsLive, multiReady } = useSmsCapability()

function parseSlotQuery(): string[] {
  const raw = route.query.slot
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string' && Boolean(v))
  if (typeof raw === 'string' && raw.includes(',')) return raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (typeof raw === 'string' && raw) return [raw]
  const multi = route.query.slots
  if (typeof multi === 'string' && multi) return multi.split(',').map((s) => s.trim()).filter(Boolean)
  return []
}

const date = ref(typeof route.query.date === 'string' ? route.query.date : today())
const selectedSlotIds = ref<string[]>(parseSlotQuery())
const selectedCourtId = ref<string | null>(typeof route.query.court === 'string' ? route.query.court : null)
const joiningWaitlist = ref(false)

const { data: slots, pending, error, refresh } = await useFetch('/api/slots/available', {
  query: computed(() => ({ club: slug, date: date.value })),
})
const { data: club } = await useFetch(`/api/clubs/${slug}`)

const visibleSlots = computed(() => {
  const list = slots.value || []
  if (!selectedCourtId.value) return list
  return list.filter((slot: { courtId?: string; court?: { id?: string } }) =>
    slot.courtId === selectedCourtId.value || slot.court?.id === selectedCourtId.value,
  )
})

const selectedSlotProps = computed(() =>
  selectedSlotIds.value
    .map((id) =>
      visibleSlots.value.find((slot: { id: string }) => slot.id === id)
      || slots.value?.find((slot: { id: string }) => slot.id === id),
    )
    .filter(Boolean) as Array<{ id: string; price?: number; startTime: string; endTime?: string }>,
)

const costLines = computed(() => {
  if (!selectedSlotProps.value.length) return []
  const lines = selectedSlotProps.value.map((slot) => ({
    label: t('booking.costService'),
    amount: formatCurrency(slot.price || 0),
  }))
  lines.push({ label: t('booking.costPlatformFee'), amount: t('booking.costPlatformFeeZero') })
  return lines
})

const totalPrice = computed(() =>
  selectedSlotProps.value.reduce((sum, slot) => sum + Number(slot.price || 0), 0),
)

function syncBookingQuery() {
  router.replace({
    query: {
      ...route.query,
      date: date.value || undefined,
      slot: selectedSlotIds.value.length ? selectedSlotIds.value.join(',') : undefined,
      court: selectedCourtId.value || undefined,
    },
  })
}

watch(date, () => {
  selectedSlotIds.value = []
  syncBookingQuery()
})

watch(selectedSlotIds, () => {
  const first = selectedSlotIds.value[0]
  if (first) {
    const row = slots.value?.find((slot: { id: string; courtId?: string; court?: { id?: string } }) => slot.id === first)
    if (row) {
      selectedCourtId.value = row.courtId || row.court?.id || selectedCourtId.value
    }
  }
  syncBookingQuery()
}, { deep: true })

watch(visibleSlots, (list) => {
  selectedSlotIds.value = selectedSlotIds.value.filter((id) => list.some((slot: { id: string }) => slot.id === id))
})

function toggleSlot(id: string) {
  if (selectedSlotIds.value.includes(id)) {
    selectedSlotIds.value = selectedSlotIds.value.filter((x) => x !== id)
    return
  }
  selectedSlotIds.value = [...selectedSlotIds.value, id]
}

function waitlistWindow() {
  const selected = selectedSlotProps.value[0]
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
  const result = await createCourtBookings({
    slotIds: selectedSlotIds.value,
    returnTo: route.fullPath,
  })
  if (result) refresh()
}

async function joinWaitlist() {
  if (!user.value) {
    openLogin({ returnTo: route.fullPath })
    return
  }
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
        courtId: selectedCourtId.value || undefined,
        guestName: user.value?.name,
        guestMobile: user.value?.phone,
      },
    })
    feedbackTone.value = 'success'
    feedback.value = t('booking.waitlistJoined')
  }
  catch (error: unknown) {
    feedbackTone.value = 'error'
    feedback.value = fetchErrorMessage(error, t('booking.actionFailed'))
  }
  finally {
    joiningWaitlist.value = false
  }
}

onMounted(() => {
  fetchAuth()
  syncBookingQuery()
})
</script>

<template>
  <div class="venus-page-stack">
    <CanvaPublicChrome :back-to="`/clubs/${slug}`" />
    <section class="canva-dash-hero">
      <p class="text-xs text-white/80">{{ t('home.bookCourt') }}</p>
      <h1 class="mt-1 text-2xl font-bold">{{ localizedField(club, 'nameFa', 'nameEn') || t('home.bookCourt') }}</h1>
      <NuxtLink :to="localePath(`/clubs/${slug}`)" class="mt-2 inline-block text-xs font-bold text-white underline">
        {{ t('booking.openClubConfirm') }}
      </NuxtLink>
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
        <p v-else-if="!smsLive" class="text-sm text-brand-gray-600">
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
          <p v-if="bookedTotal != null" class="text-sm font-bold text-start">{{ t('booking.payAtClubAmount', { amount: formatCurrency(bookedTotal) }) }}</p>
          <button v-if="canCoverWithWallet(wallet?.balance, bookedTotal, lastPaymentStatus || 'PENDING_ONLINE')" type="button" class="canva-gate-btn-secondary mt-2 w-full" :disabled="paying" @click="payBookingWithWallet()">
            {{ paying ? t('common.loading') : `${t('booking.payWithWallet')} (${formatCurrency(wallet?.balance || 0)})` }}
          </button>
        </template>
        <div v-else class="mt-2 space-y-2">
          <p class="text-sm font-bold text-brand-navy text-start">{{ t('booking.payNow') }}</p>
          <p class="text-sm text-brand-gray-600 text-start">
            {{ isTestPayments ? t('booking.onlinePayTestHint') : t('booking.onlinePayHint') }}
          </p>
          <p v-if="bookedTotal != null" class="text-sm font-bold text-start">{{ t('booking.payOnlineAmount', { amount: formatCurrency(bookedTotal) }) }}</p>
          <p v-if="feedbackTone === 'error'" class="canva-flash-error text-start">{{ feedback }}</p>
          <button type="button" class="canva-gate-btn-primary w-full" :disabled="paying" @click="payBooking()">
            {{ paying ? t('common.loading') : (lastPaymentStatus === 'FAILED' ? t('booking.payRetry') : t('booking.payNow')) }}
          </button>
          <button v-if="canCoverWithWallet(wallet?.balance, bookedTotal, lastPaymentStatus || 'PENDING_ONLINE')" type="button" class="canva-gate-btn-secondary w-full" :disabled="paying" @click="payBookingWithWallet()">
            {{ t('booking.payWithWallet') }} ({{ formatCurrency(wallet?.balance || 0) }})
          </button>
        </div>
        <NuxtLink :to="localePath('/athlete/bookings')" class="canva-gate-btn-primary mt-2 inline-block w-full">{{ t('booking.viewBookings') }}</NuxtLink>
        <NuxtLink :to="localePath(`/clubs/${slug}`)" class="btn-ghost mt-1 inline-block w-full">{{ t('booking.bookAgain') }}</NuxtLink>
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
          :class="selectedSlotIds.includes(s.id) ? 'border-brand-primary ring-2 ring-brand-primary/30' : ''"
          @click="toggleSlot(s.id)"
        >
          <p class="font-bold text-brand-navy">{{ localizedField(s.court, 'nameFa', 'nameEn') }}</p>
          <p class="text-sm"><bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(s.startTime, s.endTime) }}</bdi> · {{ formatCurrency(s.price) }}</p>
        </button>
        <BookingCostSummary
          v-if="selectedSlotProps.length && costLines.length"
          :lines="costLines.map((line, idx) => ({ ...line, muted: idx === costLines.length - 1 }))"
          :total-label="t('booking.costTotal')"
          :total-amount="formatCurrency(totalPrice)"
          :payment-note="onlineEnabled ? t('booking.costOnlineNote') : t('booking.costPayAtClubNote')"
          :cancel-note="t('booking.costCancelHint')"
        />
        <button
          v-if="visibleSlots.length"
          type="button"
          class="canva-gate-btn-primary venus-sticky-action w-full lg:w-full"
          :disabled="!selectedSlotIds.length || confirming"
          @click="confirm"
        >
          {{ confirming ? t('common.loading') : primaryCtaLabel }}
        </button>
      </div>
    </AppAsyncState>
  </div>
</template>
