<script setup lang="ts">
import { PILOT_CLUB_SLUG } from '#shared/pilotClub.ts'
import { isSlotStartInPast } from '#shared/localDate.ts'
import { isPaidPaymentStatus, isUnpaidPaymentStatus, resolvePaymentChannel } from '#shared/bookingPayment.ts'
import { formatGuestDisplayName } from '#shared/guestName.ts'

definePageMeta({ layout: 'dashboard-admin', ssr: false })

interface AdminCalendarBooking {
  id?: string
  status?: string | null
  guestName?: string | null
  guestFamily?: string | null
  payment?: { method?: string; status?: string; amount?: number } | null
  paymentMethod?: string | null
  paymentStatus?: string | null
  comments?: string | null
}

interface AdminCalendarSlot {
  id: string
  courtId: string
  date?: string
  startTime: string
  endTime: string
  displayStatus: string
  booking?: AdminCalendarBooking | null
}

interface AdminCalendarCourt {
  id: string
  nameFa: string
  nameEn: string
}

interface AdminCalendarResponse {
  date?: string
  clubSlug?: string
  courts?: AdminCalendarCourt[]
  slots?: AdminCalendarSlot[]
}

type AdminSlotCard = AdminCalendarSlot & {
  courtNameFa: string
  courtNameEn: string
}

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { localizedField } = useLocalizedField()
const { formatTimeRange, formatFaDigits } = useFormatters()
const { today } = useLocalDate()
const { secret, clearSecret, adminFetch } = useAdminSecret()

const initialClubSlug = typeof route.query.clubSlug === 'string' ? route.query.clubSlug : PILOT_CLUB_SLUG
const clubSlug = ref(initialClubSlug)
const date = ref(today())
const data = ref<AdminCalendarResponse | null>(null)
const calendarPending = ref(false)
const loadError = ref('')

const {
  externalOverlayEnabled,
  externalOverlayPending,
  externalOverlayError,
  isExternalOnlyOccupied,
  externalSiteBadge,
  refreshExternalOverlay,
} = useAdminExternalCalendarOverlay({
  clubSlug,
  date,
  secret,
  adminFetch,
})

async function loadCalendar() {
  if (!secret.value || !clubSlug.value.trim()) return
  calendarPending.value = true
  loadError.value = ''
  try {
    data.value = await adminFetch<AdminCalendarResponse>(
      `/api/admin/calendar?clubSlug=${encodeURIComponent(clubSlug.value.trim())}&date=${encodeURIComponent(date.value)}`,
    )
    void refreshExternalOverlay()
  } catch (err: unknown) {
    data.value = null
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 403) {
      loadError.value = t('admin.invalidSecret')
      clearSecret()
    } else {
      loadError.value = t('common.error')
    }
  } finally {
    calendarPending.value = false
  }
}

watch(secret, (value) => {
  if (value) void loadCalendar()
}, { immediate: true })

watch([clubSlug, date], () => {
  if (secret.value) void loadCalendar()
})

const courts = computed(() => data.value?.courts || [])

const slotCards = computed<AdminSlotCard[]>(() => {
  const courtById = new Map(courts.value.map((court) => [court.id, court]))
  return (data.value?.slots || [])
    .map((slot) => {
      const court = courtById.get(slot.courtId)
      return {
        ...slot,
        courtNameFa: court?.nameFa || '',
        courtNameEn: court?.nameEn || '',
      }
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.courtNameFa.localeCompare(b.courtNameFa))
})

function slotIsFuture(slot: AdminSlotCard) {
  const slotDate = slot.date || date.value
  return !isSlotStartInPast(slotDate, slot.startTime)
}

const freeSlotCards = computed(() =>
  slotCards.value.filter((slot) => slot.displayStatus === 'FREE' && slotIsFuture(slot)),
)

const bookableSlots = computed(() =>
  freeSlotCards.value.filter((slot) => !isExternalOnlyOccupied(slot)),
)

const blockedExternalSlots = computed(() =>
  freeSlotCards.value.filter((slot) => isExternalOnlyOccupied(slot)),
)

const bookedSlots = computed(() =>
  slotCards.value.filter((slot) =>
    slot.displayStatus !== 'FREE'
    && slot.displayStatus !== 'CANCELLED'
    && slot.displayStatus !== 'CLOSED',
  ),
)

type AdminSlotKind = 'bookable' | 'external' | 'booked'

const orderedSlotCards = computed(() => {
  const items: { kind: AdminSlotKind; slot: AdminSlotCard }[] = [
    ...bookableSlots.value.map((slot) => ({ kind: 'bookable' as const, slot })),
    ...blockedExternalSlots.value.map((slot) => ({ kind: 'external' as const, slot })),
    ...bookedSlots.value.map((slot) => ({ kind: 'booked' as const, slot })),
  ]
  return items.sort((a, b) =>
    a.slot.startTime.localeCompare(b.slot.startTime) || a.slot.courtNameFa.localeCompare(b.slot.courtNameFa),
  )
})

function courtLabel(slot: AdminSlotCard) {
  return formatFaDigits(localizedField(slot, 'courtNameFa', 'courtNameEn'))
}

function activeBooking(slot: AdminSlotCard) {
  const booking = slot.booking
  if (!booking || booking.status === 'CANCELLED') return null
  return booking
}

function slotGuestLine(slot: AdminSlotCard) {
  const booking = activeBooking(slot)
  const fullName = formatGuestDisplayName(booking?.guestName, booking?.guestFamily)
  if (fullName) return fullName
  return t(`owner.status.${slot.displayStatus}`)
}

function slotPaymentBadge(slot: AdminSlotCard) {
  const booking = activeBooking(slot)
  if (!booking) return ''
  const status = booking.payment?.status || booking.paymentStatus || null
  if (!status) return ''
  if (slot.displayStatus === 'PENDING') return t('owner.status.PENDING')
  if (isUnpaidPaymentStatus(status)) return t('owner.slotPayUnpaid')
  if (isPaidPaymentStatus(status)) return t('owner.slotPayPaid')
  return t(`booking.paymentStatus.${status}`)
}

function slotPaymentChannelLabel(slot: AdminSlotCard) {
  const booking = activeBooking(slot)
  if (!booking) return ''
  const channel = resolvePaymentChannel(
    booking.payment?.method || booking.paymentMethod,
    booking.payment?.status || booking.paymentStatus,
  )
  if (channel === 'IPG') return t('owner.status.RESERVED_IPG')
  if (channel === 'CASH') return t('owner.status.RESERVED_PAID')
  return ''
}

const calendarSourcesHref = computed(() =>
  localePath({ path: '/admin/calendar-sources', query: { clubSlug: clubSlug.value.trim() } }),
)
</script>

<template>
  <div class="tail-page-stack pb-24">
    <div class="flex flex-wrap items-center gap-3">
      <NuxtLink :to="localePath('/admin/clubs')" class="text-sm font-bold text-brand-navy underline">
        {{ t('admin.backToClubs') }}
      </NuxtLink>
    </div>

    <h1 class="tail-page-title">{{ t('admin.calendarTitle') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('admin.calendarReadOnlyNote') }}</p>

    <div class="venus-form-stack">
      <label class="block text-sm font-bold text-brand-navy">
        <span>clubSlug</span>
        <input id="admin-calendar-club-slug" v-model="clubSlug" dir="ltr" class="neo-input mt-1 block min-w-[12rem]">
      </label>

      <AppDateInput v-model="date" :label="t('common.date')" />

      <div class="flex flex-wrap items-center gap-3">
        <button type="button" class="canva-gate-btn-secondary" :disabled="calendarPending" @click="loadCalendar">
          {{ calendarPending ? t('common.loading') : 'بارگذاری' }}
        </button>
        <NuxtLink :to="calendarSourcesHref" class="text-xs font-bold text-brand-primary underline">
          {{ t('admin.calendarSourcesLink') }}
        </NuxtLink>
      </div>
    </div>

    <p v-if="loadError" class="text-sm text-red-700">{{ loadError }}</p>

    <section v-else class="space-y-4">
      <div
        v-if="externalOverlayEnabled && (externalOverlayPending || externalOverlayError)"
        class="ios-card p-3 text-sm"
        :class="externalOverlayError ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-900'"
        role="status"
      >
        <p class="font-bold">{{ externalOverlayError || t('admin.calendarOverlayLoading') }}</p>
        <button
          v-if="externalOverlayError"
          type="button"
          class="mt-2 text-xs font-bold underline"
          :disabled="externalOverlayPending"
          @click="refreshExternalOverlay()"
        >
          {{ t('admin.calendarOverlayRetry') }}
        </button>
      </div>

      <section class="space-y-2">
        <h2 class="text-sm font-bold text-brand-gray-600">{{ t('coach.book.pickSlot') }}</h2>

        <p v-if="calendarPending && !data" class="text-sm text-brand-gray-600">{{ t('common.loading') }}</p>
        <p v-else-if="data && !slotCards.length" class="ios-card border-dashed p-4 text-sm text-brand-gray-600">
          {{ t('coach.book.noSlots') }}
        </p>
        <p
          v-else-if="data && !bookableSlots.length && !blockedExternalSlots.length && !bookedSlots.length"
          class="ios-card border-dashed p-4 text-sm text-brand-gray-600"
        >
          {{ t('coach.book.noSlots') }}
        </p>

        <div v-else class="grid gap-2 sm:grid-cols-2">
          <template v-for="{ kind, slot } in orderedSlotCards" :key="`${kind}-${slot.id}`">
            <div
              v-if="kind === 'booked'"
              class="ios-card border border-brand-primary/20 bg-brand-primary/5 p-3 text-start"
            >
              <p class="text-sm font-bold">{{ courtLabel(slot) }}</p>
              <p class="text-sm">
                <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(slot.startTime, slot.endTime) }}</bdi>
              </p>
              <p class="mt-1 text-xs font-bold text-brand-navy">{{ slotGuestLine(slot) }}</p>
              <p v-if="slotPaymentBadge(slot)" class="text-xs text-brand-gray-600">{{ slotPaymentBadge(slot) }}</p>
              <p v-if="slotPaymentChannelLabel(slot)" class="text-[10px] text-brand-gray-500">{{ slotPaymentChannelLabel(slot) }}</p>
              <p v-if="activeBooking(slot)?.comments?.trim()" class="text-[10px] text-brand-gray-500">{{ activeBooking(slot)?.comments?.trim() }}</p>
            </div>

            <div
              v-else-if="kind === 'bookable'"
              class="ios-card p-3 text-start"
            >
              <p class="text-sm font-bold">{{ courtLabel(slot) }}</p>
              <p class="text-sm">
                <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(slot.startTime, slot.endTime) }}</bdi>
              </p>
              <p class="text-xs text-brand-gray-600">{{ t('owner.status.FREE') }}</p>
            </div>

            <div
              v-else
              class="ios-card border border-brand-gray-200 bg-brand-gray-50 p-3 text-start opacity-80"
              aria-disabled="true"
            >
              <p class="text-sm font-bold text-brand-gray-600">{{ courtLabel(slot) }}</p>
              <p class="text-sm text-brand-gray-600">
                <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(slot.startTime, slot.endTime) }}</bdi>
              </p>
              <p class="mt-1 text-xs font-bold text-brand-navy">{{ externalSiteBadge(slot) }}</p>
              <p class="text-[10px] text-brand-gray-500">{{ t('coach.book.externalOccupiedHint') }}</p>
            </div>
          </template>
        </div>
      </section>
    </section>
  </div>
</template>
