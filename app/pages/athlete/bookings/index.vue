<script setup lang="ts">
/** Canva p24: booking history with month control, sort, status presentation. */
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

interface CourtBooking {
  id: string
  status: string
  payment?: { status?: string; amount?: number } | null
  paymentStatus?: string | null
  bookingEquipments?: Array<{
    priceAtBooking?: number
    equipment?: { nameFa?: string; nameEn?: string } | null
  }>
  slot: {
    date: string
    startTime: string
    price?: number
    court: {
      nameFa?: string
      nameEn?: string
      club: {
        slug: string
        nameFa: string
        nameEn: string
        cancellationWindowHours: number
      }
    }
  }
}

interface CoachSession {
  id: string
  status: string
  date: string
  startTime: string
  price?: number
  payment?: { status?: string; amount?: number } | null
  paymentStatus?: string | null
  coach: { nameFa: string; nameEn: string }
}

interface PackageBooking {
  id: string
  status: string
  payment?: { status?: string; amount?: number } | null
  paymentStatus?: string | null
  package: {
    title: string
    price?: number
    club: { slug?: string; nameFa: string; nameEn: string }
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
  equipmentLines: string[]
  raw: CourtBooking | CoachSession | PackageBooking
}

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency, formatTimeRange, formatIsoDate } = useFormatters()
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
const { onlineEnabled, startCheckout, canPayOnline, canPayWithWallet } = useCheckout()
const payingId = ref<string | null>(null)
const actionError = ref('')
const paymentFlash = ref('')
const paymentFlashTone = ref<'success' | 'error'>('success')
const rescheduleTarget = ref<CourtBooking | null>(null)
const rescheduleDate = ref(today())
const rescheduleSlotId = ref('')
const reschedulePending = ref(false)
const showMonthPicker = ref(false)
const sortNewest = ref(true)
const monthAnchor = ref(today())
const cancelTarget = ref<{ kind: HistoryKind; id: string } | null>(null)
const cancelPending = ref(false)
const noticeBody = ref('')

const route = useRoute()
watch(
  () => route.query.payment,
  (value) => {
    if (value === 'success') {
      paymentFlashTone.value = 'success'
      paymentFlash.value = t('booking.paymentSuccess')
    } else if (value === 'cancelled') {
      paymentFlashTone.value = 'error'
      paymentFlash.value = t('booking.paymentCancelled')
    } else if (value === 'error') {
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
    } else if (kind === 'coach') {
      const result = await $fetch<{ refund?: { walletCredited?: boolean } }>(`/api/coach-sessions/${id}/cancel`, { method: 'PATCH' })
      if (result.refund?.walletCredited) noticeBody.value = t('booking.refundToWallet')
    } else {
      const result = await $fetch<{ refund?: { walletCredited?: boolean } }>(`/api/package-bookings/${id}/cancel`, { method: 'PATCH' })
      if (result.refund?.walletCredited) noticeBody.value = t('booking.refundToWallet')
    }
    cancelTarget.value = null
    await refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
    cancelTarget.value = null
  } finally {
    cancelPending.value = false
  }
}

async function payBooking(bookingId: string, useWallet = false) {
  payingId.value = bookingId
  actionError.value = ''
  try {
    await startCheckout({ bookingId, useWallet })
    await refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  } finally {
    payingId.value = null
  }
}

async function payCoach(sessionId: string, useWallet = false) {
  payingId.value = sessionId
  actionError.value = ''
  try {
    await startCheckout({ coachSessionId: sessionId, useWallet })
    await refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  } finally {
    payingId.value = null
  }
}

async function payPackage(packageBookingId: string, useWallet = false) {
  payingId.value = packageBookingId
  actionError.value = ''
  try {
    await startCheckout({ packageBookingId, useWallet })
    await refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  } finally {
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
    rescheduleSlotId.value = ''
    await refresh()
  } catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  } finally {
    reschedulePending.value = false
  }
}

watch(rescheduleDate, () => {
  if (rescheduleTarget.value) {
    rescheduleSlotId.value = ''
    refreshSlots()
  }
})

function paymentOf(item: { payment?: { status?: string } | null, paymentStatus?: string | null }) {
  return item.payment?.status || item.paymentStatus
}

function monthKey(iso: string) {
  return iso.slice(0, 7)
}

const monthLabel = computed(() => {
  const d = new Date(`${monthAnchor.value}T12:00:00`)
  return new Intl.DateTimeFormat(locale.value === 'fa' ? 'fa-IR' : 'en-US', {
    calendar: locale.value === 'fa' ? 'persian' : 'gregory',
    numberingSystem: locale.value === 'fa' ? 'arabext' : undefined,
    month: 'long',
    year: 'numeric',
  }).format(d)
})

const historyItems = computed((): HistoryItem[] => {
  const items: HistoryItem[] = []
  for (const b of (data.value?.courtBookings || []) as CourtBooking[]) {
    const courtName = localizedField(b.slot.court, 'nameFa', 'nameEn')
    const clubName = localizedField(b.slot.court.club, 'nameFa', 'nameEn')
    items.push({
      id: b.id,
      kind: 'court',
      status: b.status,
      date: b.slot.date,
      title: courtName ? `${courtName} ${clubName}` : clubName,
      timeLabel: formatTimeRange(b.slot.startTime),
      price: b.payment?.amount || b.slot.price || 0,
      paymentStatus: paymentOf(b),
      slug: b.slot.court.club.slug,
      equipmentLines: (b.bookingEquipments || []).map((row) => {
        const name = row.equipment ? localizedField(row.equipment, 'nameFa', 'nameEn') : ''
        return name ? `+ ${name}` : ''
      }).filter(Boolean),
      raw: b,
    })
  }
  for (const s of (data.value?.coachSessions || []) as CoachSession[]) {
    items.push({
      id: s.id,
      kind: 'coach',
      status: s.status,
      date: s.date,
      title: localizedField(s.coach, 'nameFa', 'nameEn'),
      timeLabel: formatTimeRange(s.startTime),
      price: s.payment?.amount || s.price || 0,
      paymentStatus: paymentOf(s),
      equipmentLines: [],
      raw: s,
    })
  }
  for (const b of (data.value?.packageBookings || []) as PackageBooking[]) {
    items.push({
      id: b.id,
      kind: 'package',
      status: b.status,
      date: today(),
      title: b.package.title,
      timeLabel: localizedField(b.package.club, 'nameFa', 'nameEn'),
      price: b.payment?.amount || b.package.price || 0,
      paymentStatus: paymentOf(b),
      slug: b.package.club.slug,
      equipmentLines: [],
      raw: b,
    })
  }
  return items
})

const filteredItems = computed(() => {
  const key = monthKey(monthAnchor.value)
  const list = historyItems.value.filter((item) => monthKey(item.date) === key)
  return list.sort((a, b) => {
    const cmp = a.date.localeCompare(b.date) || a.timeLabel.localeCompare(b.timeLabel)
    return sortNewest.value ? -cmp : cmp
  })
})

const hasAnyBookings = computed(() => historyItems.value.length > 0)

/** Canva status: انجام شده / انجام نشده / لغو شده */
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
  if (item.slug) return localePath(`/book/court/${item.slug}`)
  return localePath('/athlete/home')
}

function onMonthSelect() {
  showMonthPicker.value = false
}
</script>

<template>
  <div class="venus-page-stack">
    <section class="pt-5">
      <div class="flex items-center justify-between gap-3">
        <div class="relative">
          <button
            type="button"
            class="canva-date-pill gap-2"
            @click="showMonthPicker = !showMonthPicker"
          >
            <AppIcon name="calendar_month" size="sm" />
            <span>{{ monthLabel }}</span>
          </button>
          <div v-if="showMonthPicker" class="absolute z-20 mt-2 start-0">
            <AppJalaliCalendar
              v-if="locale === 'fa'"
              v-model="monthAnchor"
              @select="onMonthSelect"
            />
            <label v-else class="canva-panel block p-4">
              <span class="mb-2 block text-sm font-bold text-brand-navy">{{ t('common.date') }}</span>
              <input
                v-model="monthAnchor"
                type="date"
                dir="ltr"
                class="neo-input tabular-nums"
                @change="onMonthSelect"
              >
            </label>
          </div>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1 text-xs font-bold text-brand-gray-600"
          @click="sortNewest = !sortNewest"
        >
          <AppIcon name="sort" size="sm" />
          {{ t('athlete.historySort') }}
        </button>
      </div>
      <h1 class="mt-4 text-xl font-bold text-brand-navy">{{ t('athlete.historyTitle') }}</h1>
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
      <div v-else class="space-y-3">
        <article
          v-for="item in filteredItems"
          :key="`${item.kind}-${item.id}`"
          class="canva-list-card space-y-2"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-bold text-brand-navy">{{ item.title }}</p>
              <p class="mt-1 text-sm text-brand-gray-600" dir="auto">
                {{ formatIsoDate(item.date) }}
                <span v-if="item.kind !== 'package'"> — {{ t('athlete.historyAtTime') }} <bdi dir="ltr" class="tabular-nums">{{ item.timeLabel }}</bdi></span>
                <span v-else> · {{ item.timeLabel }}</span>
              </p>
            </div>
            <span class="canva-history-status" :class="historyStatusClass(item)">
              {{ historyStatusLabel(item) }}
            </span>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-bold text-brand-navy">{{ formatCurrency(item.price) }}</p>
            <span
              v-if="item.paymentStatus"
              class="neo-badge text-[10px]"
              :class="paymentStatusBadgeClass(item.paymentStatus)"
            >{{ paymentStatusLabel(item.paymentStatus) }}</span>
          </div>

          <div v-if="item.equipmentLines.length" class="flex flex-wrap gap-2">
            <span
              v-for="line in item.equipmentLines"
              :key="line"
              class="rounded-lg bg-brand-cream px-2 py-1 text-[11px] font-bold text-brand-gray-600"
            >{{ line }}</span>
          </div>

          <p
            v-if="item.kind === 'court' && item.status !== 'CANCELLED' && isPayAtClubStatus(item.paymentStatus)"
            class="text-xs text-brand-gray-600"
          >{{ t('booking.payAtClubDetail') }}</p>
          <p
            v-if="item.status !== 'CANCELLED' && paidHonestyNote(item.paymentStatus)"
            class="text-xs text-brand-gray-600"
          >{{ paidHonestyNote(item.paymentStatus) }}</p>

          <div class="flex flex-wrap gap-2 pt-1">
            <NuxtLink
              v-if="item.kind === 'court'"
              :to="localePath(`/athlete/bookings/${item.id}`)"
              class="btn-ghost px-3 py-1.5 text-xs"
            >{{ t('common.detail') }}</NuxtLink>
            <NuxtLink
              v-else-if="item.kind === 'coach'"
              :to="localePath(`/athlete/bookings/coach/${item.id}`)"
              class="btn-ghost px-3 py-1.5 text-xs"
            >{{ t('common.detail') }}</NuxtLink>

            <button
              v-if="item.kind === 'court' && item.status !== 'CANCELLED' && onlineEnabled && canPayOnline(item.paymentStatus)"
              type="button"
              class="btn-secondary px-3 py-1.5 text-xs"
              :disabled="payingId === item.id"
              @click="payBooking(item.id)"
            >{{ t('booking.payNow') }}</button>
            <button
              v-if="item.kind === 'court' && item.status !== 'CANCELLED' && canPayWithWallet(item.paymentStatus) && (wallet?.balance || 0) > 0"
              type="button"
              class="btn-ghost px-3 py-1.5 text-xs"
              :disabled="payingId === item.id"
              @click="payBooking(item.id, true)"
            >{{ t('booking.payWithWallet') }}</button>
            <button
              v-if="item.kind === 'coach' && item.status !== 'CANCELLED' && onlineEnabled && canPayOnline(item.paymentStatus)"
              type="button"
              class="btn-secondary px-3 py-1.5 text-xs"
              :disabled="payingId === item.id"
              @click="payCoach(item.id)"
            >{{ t('booking.payNow') }}</button>
            <button
              v-if="item.kind === 'package' && item.status !== 'CANCELLED' && onlineEnabled && canPayOnline(item.paymentStatus)"
              type="button"
              class="btn-secondary px-3 py-1.5 text-xs"
              :disabled="payingId === item.id"
              @click="payPackage(item.id)"
            >{{ t('booking.payNow') }}</button>

            <button
              v-if="item.kind === 'court' && item.status !== 'CANCELLED'"
              type="button"
              class="btn-ghost px-3 py-1.5 text-xs"
              @click="openReschedule(item.raw as CourtBooking)"
            >{{ t('booking.reschedule') }}</button>

            <button
              v-if="item.status !== 'CANCELLED' && historyStatus(item) !== 'done'"
              type="button"
              class="btn-ghost px-3 py-1.5 text-xs text-brand-primary"
              @click="requestCancel(item)"
            >{{ t('athlete.historyCancel') }}</button>

            <NuxtLink
              v-if="item.status === 'CANCELLED' || historyStatus(item) === 'done'"
              :to="rebookTo(item)"
              class="btn-primary px-3 py-1.5 text-xs"
            >{{ t('athlete.historyRebook') }}</NuxtLink>
          </div>
        </article>
      </div>

      <template #empty>
        <div class="canva-result-sheet p-6 text-center">
          <div class="canva-auth-body relative z-[1]">
            <p class="font-bold text-brand-navy">{{ t('booking.emptyState') }}</p>
            <NuxtLink :to="localePath('/athlete/home')" class="btn-primary mt-4 inline-block">{{ t('booking.emptyStateCta') }}</NuxtLink>
          </div>
        </div>
      </template>
    </AppAsyncState>

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
