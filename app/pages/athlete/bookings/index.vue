<script setup lang="ts">
/** Canva home page (7): Jalali month grid + dotted days, history cards with Cancel/Rebook. */
import { PERSIAN_MONTHS, isoToJalaali, jalaaliDaysInMonth, jalaaliToIso } from '#shared/jalali.ts'

definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

interface CourtBooking {
  id: string
  status: string
  payment?: { status?: string; amount?: number } | null
  paymentStatus?: string | null
  bookingEquipments?: Array<{
    priceAtBooking?: number
    quantity?: number
    equipment?: { nameFa?: string; nameEn?: string } | null
  }>
  slot: {
    id: string
    date: string
    startTime: string
    price?: number
    court: {
      id: string
      nameFa?: string
      nameEn?: string
      image?: string | null
      club: {
        slug: string
        nameFa: string
        nameEn: string
        image?: string | null
        cancellationWindowHours: number
      }
    }
  }
}

type HistoryKind = 'court' | 'coach' | 'package'
type HistoryItem = {
  id: string
  kind: HistoryKind
  status: string
  date: string
  title: string
  timeLabel: string
  price: number
  paymentStatus?: string | null
  slug?: string
  image?: string
  equipmentLines: string[]
  courtCountLabel: string
  raw: CourtBooking
}

const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency, formatTimeRange, formatTimeLabel, formatNumber, formatIsoDate } = useFormatters()
const { today } = useLocalDate()
const { fetchErrorMessage } = useFetchError()
const { data, pending, error, refresh } = await useAuthedFetch('/api/bookings/mine')
const { data: wallet } = await useAuthedFetch('/api/wallet', { lazy: true })
const {
  paymentStatusLabel,
  paymentStatusBadgeClass,
  isPayAtClubStatus,
  paidHonestyNote,
} = useBookingLabels()
const { onlineEnabled, startCheckout, canPayOnline, canCoverWithWallet } = useCheckout()
const payingId = ref<string | null>(null)
const actionError = ref('')
const paymentFlash = ref('')
const paymentFlashTone = ref<'success' | 'error'>('success')
const rescheduleTarget = ref<CourtBooking | null>(null)
const rescheduleDate = ref(today())
const rescheduleSlotId = ref('')
const reschedulePending = ref(false)
const sortNewest = ref(true)
const monthAnchor = ref(today())
const selectedDayIso = ref<string | null>(null)
const cancelTarget = ref<{ kind: HistoryKind; id: string } | null>(null)
const cancelPending = ref(false)
const noticeBody = ref('')

const PERSIAN_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const
const viewYear = ref(1404)
const viewMonth = ref(1)

function syncCalFromAnchor() {
  const j = isoToJalaali(monthAnchor.value || today())
  viewYear.value = j.jy
  viewMonth.value = j.jm
}
watch(monthAnchor, syncCalFromAnchor, { immediate: true })

const monthLabel = computed(() => `${PERSIAN_MONTHS[viewMonth.value - 1]} ${formatNumber(viewYear.value)}`)

const calendarCells = computed(() => {
  const daysInMonth = jalaaliDaysInMonth(viewYear.value, viewMonth.value)
  const [gy, gm, gd] = jalaaliToIso(viewYear.value, viewMonth.value, 1).split('-').map(Number)
  const weekday = new Date(gy!, gm! - 1, gd!).getDay()
  const leadingBlanks = (weekday + 1) % 7
  const cells: Array<{ day: number | null; iso: string | null }> = []
  for (let i = 0; i < leadingBlanks; i++) cells.push({ day: null, iso: null })
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, iso: jalaaliToIso(viewYear.value, viewMonth.value, day) })
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, iso: null })
  return cells
})

function prevMonth() {
  selectedDayIso.value = null
  if (viewMonth.value === 1) {
    viewMonth.value = 12
    viewYear.value -= 1
  }
  else {
    viewMonth.value -= 1
  }
  monthAnchor.value = jalaaliToIso(viewYear.value, viewMonth.value, 1)
}

function nextMonth() {
  selectedDayIso.value = null
  if (viewMonth.value === 12) {
    viewMonth.value = 1
    viewYear.value += 1
  }
  else {
    viewMonth.value += 1
  }
  monthAnchor.value = jalaaliToIso(viewYear.value, viewMonth.value, 1)
}

function selectDay(iso: string) {
  monthAnchor.value = iso
  selectedDayIso.value = selectedDayIso.value === iso ? null : iso
}

const route = useRoute()
const highlightBookingId = computed(() =>
  typeof route.query.booking === 'string' ? route.query.booking : '',
)

watch(
  () => route.query.payment,
  (value) => {
    if (value === 'success') {
      paymentFlashTone.value = 'success'
      paymentFlash.value = t('booking.paymentSuccess')
    }
    else if (value === 'cancelled') {
      paymentFlashTone.value = 'error'
      paymentFlash.value = t('booking.paymentCancelled')
    }
    else if (value === 'error') {
      paymentFlashTone.value = 'error'
      paymentFlash.value = t('booking.paymentError')
    }
  },
  { immediate: true },
)

const { data: replacementSlots, refresh: refreshSlots } = await useAuthedFetch('/api/slots/available', {
  query: computed(() => ({
    club: rescheduleTarget.value?.slot?.court?.club?.slug,
    date: rescheduleDate.value,
  })),
  immediate: false,
})

async function openReschedule(booking: CourtBooking) {
  actionError.value = ''
  rescheduleTarget.value = booking
  rescheduleDate.value = booking.slot.date
  rescheduleSlotId.value = ''
  await refreshSlots()
}

function closeReschedule() {
  if (reschedulePending.value) return
  rescheduleTarget.value = null
  rescheduleSlotId.value = ''
}

function requestCancel(item: HistoryItem) {
  actionError.value = ''
  cancelTarget.value = { kind: item.kind, id: item.id }
}

function closeCancel() {
  if (cancelPending.value) return
  cancelTarget.value = null
}

function closeNotice() {
  noticeBody.value = ''
}

async function confirmCancel() {
  if (!cancelTarget.value) return
  const { kind, id } = cancelTarget.value
  cancelPending.value = true
  actionError.value = ''
  try {
    if (kind === 'court') {
      const result = await $fetch<{ refund?: { walletCredited?: boolean; refunded?: boolean } }>(`/api/bookings/${id}/cancel`, { method: 'PATCH' })
      if (result.refund?.walletCredited) noticeBody.value = t('booking.refundToWallet')
      else if (result.refund?.refunded) noticeBody.value = t('booking.refundToGateway')
    }
    cancelTarget.value = null
    await refresh()
  }
  catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
    cancelTarget.value = null
  }
  finally {
    cancelPending.value = false
  }
}

async function payBooking(bookingId: string, useWallet = false) {
  if (payingId.value) return
  payingId.value = bookingId
  actionError.value = ''
  try {
    await startCheckout({ bookingId, useWallet })
    await refresh()
  }
  catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  }
  finally {
    payingId.value = null
  }
}

async function rescheduleCourt() {
  if (!rescheduleTarget.value || !rescheduleSlotId.value) return
  actionError.value = ''
  reschedulePending.value = true
  try {
    await $fetch(`/api/bookings/${rescheduleTarget.value.id}/reschedule`, {
      method: 'PATCH',
      body: { slotId: rescheduleSlotId.value },
    })
    rescheduleTarget.value = null
    await refresh()
  }
  catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  }
  finally {
    reschedulePending.value = false
  }
}

function paymentOf(row: { payment?: { status?: string } | null; paymentStatus?: string | null }) {
  return row.payment?.status || row.paymentStatus || null
}

function monthKeyJalali(iso: string) {
  const j = isoToJalaali(iso)
  return `${j.jy}-${String(j.jm).padStart(2, '0')}`
}

const historyItems = computed((): HistoryItem[] => {
  const items: HistoryItem[] = []
  for (const b of (data.value?.courtBookings || []) as CourtBooking[]) {
    const courtName = localizedField(b.slot.court, 'nameFa', 'nameEn')
    const clubName = localizedField(b.slot.court.club, 'nameFa', 'nameEn')
    const equipLines = (b.bookingEquipments || []).map((row) => {
      const name = row.equipment ? localizedField(row.equipment, 'nameFa', 'nameEn') : ''
      if (!name) return ''
      const qty = Math.max(1, row.quantity || 1)
      return t('athlete.historyEquipmentQty', { qty: formatNumber(qty), name })
    }).filter(Boolean) as string[]
    items.push({
      id: b.id,
      kind: 'court',
      status: b.status,
      date: b.slot.date,
      title: clubName || courtName,
      timeLabel: formatTimeLabel(b.slot.startTime),
      price: b.payment?.amount || b.slot.price || 0,
      paymentStatus: paymentOf(b),
      slug: b.slot.court.club.slug,
      image: b.slot.court.image || b.slot.court.club.image || '/placeholders/club.svg',
      equipmentLines: equipLines,
      // One row = one court booking; do not invent a group count across separate rows.
      courtCountLabel: t('athlete.historyCourtQty', { qty: formatNumber(1) }),
      raw: b,
    })
  }
  // Court MVP Canva frame: coach/package history never listed here.
  return items
})

watch(
  [historyItems, highlightBookingId],
  async () => {
    const id = highlightBookingId.value
    if (!id) return
    const item = historyItems.value.find((row) => row.id === id)
    if (!item) return
    monthAnchor.value = item.date
    selectedDayIso.value = item.date
    await nextTick()
    if (!import.meta.client) return
    document.getElementById(`booking-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  },
  { immediate: true },
)

const visibleHistory = computed(() => historyItems.value)

const activeDaySet = computed(() => {
  const key = `${viewYear.value}-${String(viewMonth.value).padStart(2, '0')}`
  const set = new Set<string>()
  for (const item of visibleHistory.value) {
    if (monthKeyJalali(item.date) === key) set.add(item.date)
  }
  return set
})

function dayHasActivity(iso: string | null) {
  return Boolean(iso && activeDaySet.value.has(iso))
}

const selectedDayTimes = computed(() => {
  const day = selectedDayIso.value
  if (!day) return [] as string[]
  return [...new Set(
    visibleHistory.value.filter((i) => i.date === day).map((i) => i.timeLabel),
  )].slice(0, 4)
})

const filteredItems = computed(() => {
  const key = `${viewYear.value}-${String(viewMonth.value).padStart(2, '0')}`
  let list = visibleHistory.value.filter((item) => monthKeyJalali(item.date) === key)
  if (selectedDayIso.value) {
    list = list.filter((item) => item.date === selectedDayIso.value)
  }
  return list.sort((a, b) => {
    const cmp = a.date.localeCompare(b.date) || a.timeLabel.localeCompare(b.timeLabel)
    return sortNewest.value ? -cmp : cmp
  })
})

const hasAnyBookings = computed(() => visibleHistory.value.length > 0)

function historyStatus(item: HistoryItem): 'done' | 'pending' | 'cancelled' {
  if (item.status === 'CANCELLED') return 'cancelled'
  if (item.date < today()) return 'done'
  return 'pending'
}

function historyStatusLabel(item: HistoryItem) {
  const s = historyStatus(item)
  if (s === 'done') return t('athlete.historyStatusDone')
  if (s === 'cancelled') return t('athlete.historyStatusCancelled')
  return t('athlete.historyStatusPending')
}

function historyStatusClass(item: HistoryItem) {
  const s = historyStatus(item)
  if (s === 'done') return 'canva-history-status-done'
  if (s === 'cancelled') return 'canva-history-status-cancelled'
  return 'canva-history-status-pending'
}

function rebookTo(item: HistoryItem) {
  if (!item.slug) return localePath('/clubs')
  /** Club detail hydrates from `date` / `slot` / `court` / `time` (legacy book redirect + rebook). */
  const todayIso = today()
  const priorDate = item.date || ''
  const date = priorDate && priorDate >= todayIso ? priorDate : todayIso
  const query: Record<string, string> = { date }
  const courtId = item.raw?.slot?.court?.id
  if (courtId) query.court = courtId
  const slotId = item.raw?.slot?.id
  const startTime = item.raw?.slot?.startTime?.slice(0, 5)
  // Same-day rebook can reuse the prior slot id when still FREE.
  if (priorDate >= todayIso && slotId) {
    query.slot = slotId
  }
  else if (startTime) {
    // Past booking: match free slot(s) with the same clock time on the new date.
    query.time = startTime
  }
  return localePath({ path: `/clubs/${item.slug}`, query })
}

function canCancel(item: HistoryItem) {
  return item.status !== 'CANCELLED' && historyStatus(item) !== 'done'
}

function canRebook(item: HistoryItem) {
  return item.status === 'CANCELLED' || historyStatus(item) === 'done'
}

function dateLine(item: HistoryItem) {
  return `${formatIsoDate(item.date)} — ${t('athlete.historyAtTime')} ${item.timeLabel}`
}
</script>

<template>
  <div class="venus-page-stack">
    <CanvaAthleteChrome>
      <NuxtLink :to="localePath('/athlete/notifications')" :aria-label="t('notifications.title')">
        <AppIcon name="notifications" size="sm" />
      </NuxtLink>
    </CanvaAthleteChrome>

    <div class="canva-history-desktop">
    <section class="canva-history-cal">
      <div class="canva-history-cal-layout">
        <div v-if="selectedDayTimes.length" class="canva-history-cal-times" aria-hidden="true">
          <span
            v-for="time in selectedDayTimes"
            :key="time"
            class="canva-history-time-chip"
          >{{ time }}</span>
        </div>
        <div class="canva-history-cal-grid-wrap">
          <div class="canva-history-cal-nav">
            <button type="button" class="canva-history-cal-nav-btn" :aria-label="t('calendar.prevMonth')" @click="prevMonth">
              <AppIcon name="chevron_right" size="sm" />
            </button>
            <p class="canva-history-cal-month">{{ monthLabel }}</p>
            <button type="button" class="canva-history-cal-nav-btn" :aria-label="t('calendar.nextMonth')" @click="nextMonth">
              <AppIcon name="chevron_left" size="sm" />
            </button>
          </div>
          <div class="canva-history-cal-weekdays">
            <span v-for="wd in PERSIAN_WEEKDAYS" :key="wd">{{ wd }}</span>
          </div>
          <div class="canva-history-cal-grid">
            <template v-for="(cell, index) in calendarCells" :key="index">
              <button
                v-if="cell.day && cell.iso"
                type="button"
                class="canva-history-cal-day"
                :class="{
                  'canva-history-cal-day-active': cell.iso === selectedDayIso,
                  'canva-history-cal-day-dotted': dayHasActivity(cell.iso),
                }"
                @click="selectDay(cell.iso!)"
              >
                <span>{{ formatNumber(cell.day) }}</span>
                <span v-if="dayHasActivity(cell.iso)" class="canva-history-cal-dot" aria-hidden="true" />
              </button>
              <span v-else class="canva-history-cal-day canva-history-cal-day-empty" />
            </template>
          </div>
        </div>
      </div>
    </section>

    <div class="canva-history-desktop-main">
    <section class="canva-history-head">
      <h1 class="canva-history-title">{{ t('athlete.historyTitle') }}</h1>
      <button
        type="button"
        class="canva-history-sort"
        @click="sortNewest = !sortNewest"
      >
        <AppIcon name="tune" size="sm" />
        {{ t('athlete.historySort') }}
      </button>
    </section>

    <p
      v-if="paymentFlash"
      class="text-sm"
      :class="paymentFlashTone === 'success' ? 'canva-flash-success' : 'canva-flash-error'"
    >
      {{ paymentFlash }}
    </p>
    <p v-if="actionError" class="canva-flash-error">{{ actionError }}</p>

    <AppAsyncState :pending="pending" :error="error" :empty="Boolean(data) && !hasAnyBookings" skeleton-variant="table">
      <CanvaEmptyState
        v-if="!filteredItems.length"
        :title="t('athlete.historyEmptyMonth')"
        :body="t('booking.emptyState')"
        doodle="seat"
      />
      <div v-else class="canva-history-card-grid">
        <article
          v-for="item in filteredItems"
          :id="`booking-${item.id}`"
          :key="`${item.kind}-${item.id}`"
          class="canva-history-card"
        >
          <div class="canva-history-card-main">
            <img
              v-if="item.image"
              :src="item.image"
              alt=""
              class="canva-history-card-thumb"
            >
            <div class="canva-history-card-copy min-w-0 flex-1 text-start">
              <p class="canva-history-card-title">
                {{ item.title }}
                <span class="canva-history-status" :class="historyStatusClass(item)">({{ historyStatusLabel(item) }})</span>
              </p>
              <p class="canva-history-card-meta">{{ dateLine(item) }}</p>
              <p class="canva-history-card-price">{{ formatCurrency(item.price) }}</p>
              <div v-if="item.equipmentLines.length || item.courtCountLabel" class="canva-history-card-meta-row">
                <span v-for="line in item.equipmentLines" :key="line" class="canva-history-meta-chip">{{ line }}</span>
                <span v-if="item.courtCountLabel" class="canva-history-meta-chip">{{ item.courtCountLabel }}</span>
              </div>
              <p
                v-if="item.kind === 'court' && item.status !== 'CANCELLED' && isPayAtClubStatus(item.paymentStatus)"
                class="mt-1 text-[11px] text-brand-gray-600"
              >{{ t('booking.payAtClubDetail') }}</p>
              <p
                v-if="item.status !== 'CANCELLED' && paidHonestyNote(item.paymentStatus)"
                class="mt-1 text-[11px] text-brand-gray-600"
              >{{ paidHonestyNote(item.paymentStatus) }}</p>
              <span
                v-if="item.paymentStatus && historyStatus(item) === 'pending'"
                class="mt-1 inline-block text-[10px] font-bold"
                :class="paymentStatusBadgeClass(item.paymentStatus)"
              >{{ paymentStatusLabel(item.paymentStatus) }}</span>
            </div>
            <div class="canva-history-card-actions">
              <button
                v-if="canCancel(item)"
                type="button"
                class="canva-history-btn-cancel"
                @click="requestCancel(item)"
              >{{ t('athlete.historyCancel') }}</button>
              <NuxtLink
                v-else-if="canRebook(item)"
                :to="rebookTo(item)"
                class="canva-history-btn-rebook"
              >{{ t('athlete.historyRebook') }}</NuxtLink>

              <button
                v-if="item.kind === 'court' && item.status !== 'CANCELLED' && onlineEnabled && canPayOnline(item.paymentStatus)"
                type="button"
                class="canva-history-btn-secondary"
                :class="{ 'canva-cta-busy': payingId === item.id }"
                :aria-busy="payingId === item.id"
                @click="payBooking(item.id)"
              >{{ payingId === item.id ? t('booking.redirectingToGateway') : t('booking.payNow') }}</button>
              <button
                v-if="item.kind === 'court' && item.status !== 'CANCELLED' && canCoverWithWallet(wallet?.balance, item.price, item.paymentStatus)"
                type="button"
                class="canva-history-btn-secondary"
                :disabled="payingId === item.id"
                @click="payBooking(item.id, true)"
              >{{ t('booking.payWithWallet') }}</button>
              <button
                v-if="item.kind === 'court' && item.status !== 'CANCELLED' && historyStatus(item) === 'pending'"
                type="button"
                class="canva-history-btn-secondary"
                @click="openReschedule(item.raw as CourtBooking)"
              >{{ t('booking.reschedule') }}</button>
            </div>
          </div>
        </article>
      </div>

      <template #empty>
        <div class="canva-result-sheet p-6 text-center">
          <div class="canva-auth-body relative z-[1]">
            <p class="font-bold text-brand-navy">{{ t('booking.emptyState') }}</p>
            <NuxtLink :to="localePath('/clubs')" class="canva-gate-btn-primary mt-4 inline-block">{{ t('booking.emptyStateCta') }}</NuxtLink>
          </div>
        </div>
      </template>
    </AppAsyncState>
    </div>
    </div>

    <AppModal
      :open="Boolean(rescheduleTarget)"
      patterned
      sheet
      max-width-class="canva-phone-shell max-w-sm"
      :title="t('booking.reschedule')"
      @close="closeReschedule"
    >
      <div class="canva-auth-body space-y-4 px-5 pb-6 pt-2">
        <AppDateInput v-model="rescheduleDate" :min-date="today()" />
        <div class="max-h-64 space-y-2 overflow-auto">
          <button
            v-for="slot in replacementSlots"
            :key="slot.id"
            type="button"
            class="w-full border border-brand-gray-200 bg-white/95 px-3 py-3 text-start text-sm text-brand-navy"
            :class="rescheduleSlotId === slot.id ? 'border-brand-primary bg-brand-primary-soft/50' : ''"
            style="border-radius: var(--sz-canva-radius);"
            @click="rescheduleSlotId = slot.id"
          >
            {{ localizedField(slot.court, 'nameFa', 'nameEn') }} · <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(slot.startTime) }}</bdi>
          </button>
          <p v-if="replacementSlots && !replacementSlots.length" class="text-sm text-brand-gray-600">
            {{ t('booking.noSlots') }}
          </p>
        </div>
        <button
          type="button"
          class="canva-gate-btn-primary"
          :disabled="!rescheduleSlotId || reschedulePending"
          @click="rescheduleCourt"
        >
          {{ reschedulePending ? t('common.loading') : t('booking.confirmReschedule') }}
        </button>
        <button type="button" class="canva-gate-btn-secondary" :disabled="reschedulePending" @click="closeReschedule">
          {{ t('common.close') }}
        </button>
      </div>
    </AppModal>

    <CanvaConfirmSheet
      :open="Boolean(cancelTarget)"
      :title="t('booking.confirmCancelTitle')"
      :body="t('booking.confirmCancel')"
      :confirm-label="t('booking.confirmYes')"
      :dismiss-label="t('booking.confirmNo')"
      :pending="cancelPending"
      danger
      @confirm="confirmCancel"
      @close="closeCancel"
    />

    <CanvaConfirmSheet
      :open="Boolean(noticeBody)"
      :title="t('booking.refundNoticeTitle')"
      :body="noticeBody"
      :confirm-label="t('booking.noticeOk')"
      notice
      @confirm="closeNotice"
      @close="closeNotice"
    />
  </div>
</template>
