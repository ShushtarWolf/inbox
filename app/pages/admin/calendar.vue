<script setup lang="ts">
import { PILOT_CLUB_SLUG } from '#shared/pilotClub.ts'
import { palette } from '#shared/palette.ts'
import { addDaysToIsoDate, isSlotStartInPast } from '#shared/localDate.ts'
import { isPaidPaymentStatus, isUnpaidPaymentStatus, resolvePaymentChannel } from '#shared/bookingPayment.ts'
import { formatGuestDisplayName } from '#shared/guestName.ts'
import { isOwnerRecurringBooking } from '#shared/recurringReserve.ts'

definePageMeta({ layout: 'dashboard-admin', ssr: false })

interface AdminCalendarBooking {
  id?: string
  status?: string | null
  source?: string | null
  guestName?: string | null
  guestFamily?: string | null
  guestMobile?: string | null
  packageDraftId?: string | null
  isRecurring?: boolean | null
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
  effectiveOpenHour?: number
  effectiveCloseHour?: number
}

interface AdminCalendarResponse {
  date?: string
  clubSlug?: string
  courts?: AdminCalendarCourt[]
  slots?: AdminCalendarSlot[]
  clubOpenHour?: number
  clubCloseHour?: number
  sessionDurationMinutes?: number
}

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { localizedField } = useLocalizedField()
const { formatTimeLabel, formatNumber, formatFaDigits } = useFormatters()
const { today } = useLocalDate()
const { secret, clearSecret, adminFetch } = useAdminSecret()

const initialClubSlug = typeof route.query.clubSlug === 'string' ? route.query.clubSlug : PILOT_CLUB_SLUG
const clubSlug = ref(initialClubSlug)
const date = ref(today())
const data = ref<AdminCalendarResponse | null>(null)
const pending = ref(false)
const loadError = ref('')

const {
  externalOverlayEnabled,
  isExternalOnlyOccupied,
  externalSiteBadge,
  refreshExternalOverlay,
} = useAdminExternalCalendarOverlay({
  clubSlug,
  date,
  adminFetch,
})

async function loadCalendar() {
  if (!secret.value || !clubSlug.value.trim()) return
  pending.value = true
  loadError.value = ''
  try {
    data.value = await adminFetch<AdminCalendarResponse>(
      `/api/admin/calendar?clubSlug=${encodeURIComponent(clubSlug.value.trim())}&date=${encodeURIComponent(date.value)}`,
    )
    await refreshExternalOverlay()
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
    pending.value = false
  }
}

watch(secret, (value) => {
  if (value) void loadCalendar()
}, { immediate: true })

watch([clubSlug, date], () => {
  if (secret.value) void loadCalendar()
})

const hours = computed(() => {
  const set = new Set<string>()
  data.value?.slots?.forEach((slot) => set.add(slot.startTime))
  return [...set].sort()
})

const courts = computed(() => data.value?.courts || [])

const gridTemplateColumns = computed(() => {
  const courtCount = Math.max(courts.value.length, 1)
  return `var(--canva-cal-gutter, 2.75rem) repeat(${courtCount}, minmax(var(--canva-cal-court-min, 5.5rem), 1fr))`
})

function shiftDate(delta: number) {
  date.value = addDaysToIsoDate(date.value, delta)
}

function cellSlot(courtId: string, hour: string) {
  return data.value?.slots?.find((slot) => slot.courtId === courtId && slot.startTime === hour)
}

function activeBooking(slot: AdminCalendarSlot | null | undefined) {
  const booking = slot?.booking
  if (!booking || booking.status === 'CANCELLED') return null
  return booking
}

function isReservedDisplayStatus(status: string) {
  return status === 'RESERVED' || status === 'PUBLIC' || status === 'TEAM'
}

function slotPaymentStatus(slot: AdminCalendarSlot | null | undefined) {
  const booking = activeBooking(slot)
  if (!booking) return null
  return booking.payment?.status || booking.paymentStatus || null
}

function slotPaymentChannel(slot?: AdminCalendarSlot | null) {
  const booking = activeBooking(slot)
  if (!booking) return null
  return resolvePaymentChannel(
    booking.payment?.method || booking.paymentMethod,
    booking.payment?.status || booking.paymentStatus,
  )
}

function isIpgReservedSlot(slot?: AdminCalendarSlot | null) {
  return isReservedDisplayStatus(slot?.displayStatus || '') && slotPaymentChannel(slot) === 'IPG'
}

function isRecurringReservedSlot(slot?: AdminCalendarSlot | null) {
  return isReservedDisplayStatus(slot?.displayStatus || '')
    && isOwnerRecurringBooking(activeBooking(slot))
}

function slotIsInPast(slot: AdminCalendarSlot) {
  const slotDate = slot.date || date.value
  return isSlotStartInPast(slotDate, slot.startTime)
}

function isPastFreeSlot(slot: AdminCalendarSlot | null | undefined) {
  return Boolean(slot && slot.displayStatus === 'FREE' && slotIsInPast(slot))
}

function statusLabel(status: string) {
  return t(`owner.status.${status}`)
}

function slotGuestLine(slot: AdminCalendarSlot | null | undefined) {
  if (!slot) return ''
  if (isExternalOnlyOccupied(slot)) return externalSiteBadge(slot)
  if (slot.displayStatus === 'FREE') return ''
  if (slot.displayStatus === 'BLOCKED' || slot.displayStatus === 'CLOSED') {
    return t('owner.slotBlockedLabel')
  }
  const booking = activeBooking(slot)
  const fullName = formatGuestDisplayName(booking?.guestName, booking?.guestFamily)
  return fullName || statusLabel(slot.displayStatus)
}

function slotNoteLine(slot: AdminCalendarSlot | null | undefined) {
  if (!slot) return ''
  if (isExternalOnlyOccupied(slot)) return ''
  if (slot.displayStatus === 'FREE') return ''
  return activeBooking(slot)?.comments?.trim() || ''
}

function slotPaymentBadge(slot: AdminCalendarSlot | null | undefined) {
  const status = slotPaymentStatus(slot)
  if (!status || slot?.displayStatus === 'FREE' || slot?.displayStatus === 'BLOCKED') return ''
  if (slot?.displayStatus === 'PENDING') return t('owner.status.PENDING')
  if (isUnpaidPaymentStatus(status)) return t('owner.slotPayUnpaid')
  if (isPaidPaymentStatus(status)) return t('owner.slotPayPaid')
  return t(`booking.paymentStatus.${status}`)
}

function slotPaymentBadgeClass(slot: AdminCalendarSlot | null | undefined) {
  const status = slotPaymentStatus(slot)
  if (!status) return ''
  return isUnpaidPaymentStatus(status) ? 'canva-slot-pay-unpaid' : 'canva-slot-pay-paid'
}

function slotClass(status: string, slot?: AdminCalendarSlot | null) {
  const map: Record<string, string> = {
    FREE: 'slot-free',
    RESERVED: 'slot-reserved',
    PUBLIC: 'slot-public',
    TEAM: 'slot-team',
    PENDING: 'slot-pending',
    CANCELLED: 'slot-cancel',
    CLOSED: 'slot-closed',
    BLOCKED: 'slot-blocked',
  }
  const base = map[status] || 'slot-free'
  if (slot && status === 'FREE' && slotIsInPast(slot)) return `${base} slot-past`
  if (isReservedDisplayStatus(status)) {
    if (isRecurringReservedSlot(slot)) return `${base} slot-reserved-recurring`
    if (isUnpaidPaymentStatus(slotPaymentStatus(slot))) return `${base} slot-reserved-unpaid`
    if (slotPaymentChannel(slot) === 'IPG') return `${base} slot-reserved-ipg`
    return `${base} slot-reserved-cash`
  }
  return base
}

function gridCellClasses(courtId: string, hour: string) {
  const slot = cellSlot(courtId, hour)
  if (isExternalOnlyOccupied(slot)) return ['slot-blocked']
  return [slotClass(slot?.displayStatus || 'FREE', slot)]
}

function gridCellBarClass(slot?: AdminCalendarSlot | null) {
  if (isExternalOnlyOccupied(slot)) return 'canva-cal-grid-cell-bar-blocked'
  const status = slot?.displayStatus || 'FREE'
  if (isReservedDisplayStatus(status)) {
    if (isRecurringReservedSlot(slot)) return 'canva-cal-grid-cell-bar-reserved-recurring'
    if (isUnpaidPaymentStatus(slotPaymentStatus(slot))) return 'canva-cal-grid-cell-bar-reserved-unpaid'
    if (isIpgReservedSlot(slot)) return 'canva-cal-grid-cell-bar-reserved-ipg'
    return 'canva-cal-grid-cell-bar-reserved-cash'
  }
  const map: Record<string, string> = {
    FREE: 'canva-cal-grid-cell-bar-free',
    PENDING: 'canva-cal-grid-cell-bar-pending',
    CANCELLED: 'canva-cal-grid-cell-bar-cancel',
    CLOSED: 'canva-cal-grid-cell-bar-closed',
    BLOCKED: 'canva-cal-grid-cell-bar-blocked',
  }
  return map[status] || 'canva-cal-grid-cell-bar-free'
}

function courtColumnLabel(court: { nameFa: string; nameEn: string }, index: number) {
  const name = formatFaDigits(localizedField(court, 'nameFa', 'nameEn'))
  return name || t('booking.courtNumber', { n: formatNumber(index + 1) })
}

function slotCellTitle(slot: AdminCalendarSlot | null | undefined) {
  if (!slot) return ''
  if (isExternalOnlyOccupied(slot)) return externalSiteBadge(slot)
  if (slot.displayStatus === 'FREE') {
    return isPastFreeSlot(slot) ? t('owner.slotPast') : ''
  }
  return [slotGuestLine(slot), slotPaymentBadge(slot), slotNoteLine(slot)].filter(Boolean).join(' — ')
}

const formattedDate = computed(() => {
  try {
    return new Intl.DateTimeFormat(locale.value === 'fa' ? 'fa-IR' : 'en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Tehran',
      ...(locale.value === 'fa' ? { calendar: 'persian', numberingSystem: 'arabext' } : {}),
    }).format(new Date(`${date.value}T12:00:00`))
  } catch {
    return date.value
  }
})

const legend = [
  { status: 'FREE', color: palette.calendarGrid.FREE },
  { status: 'RESERVED_PAID', color: palette.calendarGrid.RESERVED_PAID },
  { status: 'RESERVED_UNPAID', color: palette.calendarGrid.RESERVED_UNPAID },
  { status: 'RESERVED_IPG', color: palette.calendarGrid.RESERVED_IPG },
  { status: 'RESERVED_RECURRING', color: palette.calendarGrid.RESERVED_RECURRING },
  { status: 'PENDING', color: palette.calendarGrid.PENDING },
  { status: 'BLOCKED', color: palette.calendarGrid.BLOCKED },
]

const calendarSourcesHref = computed(() =>
  localePath({ path: '/admin/calendar-sources', query: { clubSlug: clubSlug.value.trim() } }),
)
</script>

<template>
  <div class="tail-page-stack pb-24" :class="String(locale) === 'en' ? 'calendar-latin' : ''">
    <div class="flex flex-wrap items-center gap-3">
      <NuxtLink :to="localePath('/admin/clubs')" class="text-sm font-bold text-brand-navy underline">
        {{ t('admin.backToClubs') }}
      </NuxtLink>
    </div>

    <h1 class="tail-page-title">{{ t('admin.calendarTitle') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('admin.calendarReadOnlyNote') }}</p>

    <div class="flex flex-wrap items-end gap-3">
      <label class="block text-sm font-bold text-brand-navy">
        <span>clubSlug</span>
        <input id="admin-calendar-club-slug" v-model="clubSlug" dir="ltr" class="neo-input mt-1 block min-w-[12rem]">
      </label>
      <button type="button" class="canva-gate-btn-secondary" :disabled="pending" @click="loadCalendar">
        {{ pending ? t('common.loading') : 'بارگذاری' }}
      </button>
      <NuxtLink :to="calendarSourcesHref" class="text-xs font-bold text-brand-primary underline">
        {{ t('admin.calendarSourcesLink') }}
      </NuxtLink>
    </div>

    <p v-if="loadError" class="text-sm text-red-700">{{ loadError }}</p>

    <section v-else class="space-y-3">
      <div class="canva-legend-row">
        <div v-for="item in legend" :key="item.status" class="canva-legend-item">
          <span
            class="canva-legend-swatch"
            :class="item.status === 'FREE' ? 'canva-legend-swatch-free' : ''"
            :style="item.status === 'FREE' ? undefined : { background: item.color }"
          />
          {{ statusLabel(item.status) }}
        </div>
        <span v-if="externalOverlayEnabled" class="canva-cal-legend-note">
          {{ t('admin.calendarExternalLegend') }}
        </span>
      </div>

      <div class="canva-cal-grid-shell">
        <div class="canva-cal-date-nav">
          <div class="canva-cal-date-nav-center">
            <button type="button" class="canva-cal-date-nav-btn" :aria-label="t('calendar.prevMonth')" @click="shiftDate(-1)">
              <AppIcon name="chevron_right" size="sm" />
            </button>
            <span class="canva-cal-date-nav-label">{{ formattedDate }}</span>
            <button type="button" class="canva-cal-date-nav-btn" :aria-label="t('calendar.nextMonth')" @click="shiftDate(1)">
              <AppIcon name="chevron_left" size="sm" />
            </button>
          </div>
        </div>

        <div class="canva-cal-body">
          <p v-if="pending && !data" class="px-4 py-8 text-center text-sm text-brand-navy/70">
            {{ t('common.loading') }}
          </p>
          <div v-else-if="!courts.length">
            <CanvaEmptyState :title="t('owner.emptyCourtsTitle')" doodle="bench" />
          </div>
          <div v-else-if="!hours.length">
            <CanvaEmptyState :title="t('owner.emptySlotsTitle')" :body="t('owner.emptySlotsBody')" doodle="seat" />
          </div>
          <div v-else class="canva-cal-grid-scroll">
            <div class="canva-cal-grid" :style="{ gridTemplateColumns }">
              <div class="canva-cal-grid-corner" />
              <div
                v-for="(court, idx) in courts"
                :key="court.id"
                class="canva-cal-grid-court"
                :title="courtColumnLabel(court, idx)"
              >
                {{ courtColumnLabel(court, idx) }}
              </div>
              <template v-for="hour in hours" :key="hour">
                <div class="canva-cal-grid-time">
                  <bdi dir="ltr" class="tabular-nums">{{ formatTimeLabel(hour) }}</bdi>
                </div>
                <div
                  v-for="court in courts"
                  :key="`${court.id}-${hour}`"
                  class="canva-cal-grid-cell"
                  :class="gridCellClasses(court.id, hour)"
                  :title="slotCellTitle(cellSlot(court.id, hour))"
                >
                  <span
                    v-if="cellSlot(court.id, hour) && (cellSlot(court.id, hour)!.displayStatus !== 'FREE' || isExternalOnlyOccupied(cellSlot(court.id, hour)))"
                    class="canva-cal-grid-cell-bar"
                    :class="gridCellBarClass(cellSlot(court.id, hour))"
                  />
                  <span class="canva-cal-grid-cell-body">
                    <span v-if="isPastFreeSlot(cellSlot(court.id, hour)) && !isExternalOnlyOccupied(cellSlot(court.id, hour))" class="canva-cal-grid-cell-label">{{ t('owner.slotPast') }}</span>
                    <span v-else-if="slotGuestLine(cellSlot(court.id, hour))" class="canva-cal-grid-cell-label">{{ slotGuestLine(cellSlot(court.id, hour)) }}</span>
                    <span
                      v-if="slotPaymentBadge(cellSlot(court.id, hour))"
                      class="canva-slot-pay-chip"
                      :class="slotPaymentBadgeClass(cellSlot(court.id, hour))"
                    >{{ slotPaymentBadge(cellSlot(court.id, hour)) }}</span>
                    <span v-if="slotNoteLine(cellSlot(court.id, hour))" class="canva-cal-grid-cell-sub">{{ slotNoteLine(cellSlot(court.id, hour)) }}</span>
                  </span>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
:deep(.canva-cal-grid-cell.slot-free) {
  background: var(--canva-cal-free-bg, #f8fafc);
}

:deep(.canva-cal-grid-cell.slot-past) {
  opacity: 0.55;
}

:deep(.canva-cal-grid-cell.slot-reserved),
:deep(.canva-cal-grid-cell.slot-reserved-cash),
:deep(.canva-cal-grid-cell.slot-public),
:deep(.canva-cal-grid-cell.slot-team) {
  background: var(--canva-cal-reserved-bg, #fce7f3);
}

:deep(.canva-cal-grid-cell.slot-blocked) {
  background: var(--canva-cal-blocked-bg, #e2e8f0);
}

:deep(.canva-cal-grid-cell.slot-reserved-unpaid) {
  background: var(--canva-cal-unpaid-bg, #fef3c7);
}

:deep(.canva-cal-grid-cell.slot-reserved-ipg) {
  background: var(--canva-cal-ipg-bg, #dbeafe);
}

:deep(.canva-cal-grid-cell.slot-reserved-recurring) {
  background: var(--canva-cal-recurring-bg, #ede9fe);
}

:deep(.canva-cal-grid-cell.slot-pending) {
  background: var(--canva-cal-pending-bg, #ffedd5);
}

:deep(.canva-cal-grid-cell.slot-cancel) {
  background: var(--canva-cal-cancel-bg, #f1f5f9);
}

:deep(.canva-cal-grid-cell.slot-closed) {
  background: var(--canva-cal-closed-bg, #f8fafc);
  opacity: 0.6;
}
</style>
