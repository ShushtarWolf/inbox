<script setup lang="ts">
/** Reserve history: status summary, Jalali calendar with status dots, status chips, cards → details sheet. */
import { athleteListPrice, parseSeriesPaymentMeta } from '#shared/athleteSeason.ts'
import { PERSIAN_MONTHS, isoToJalaali, jalaaliDaysInMonth, jalaaliToIso } from '#shared/jalali.ts'
import { canCancelReservation } from '#shared/cancelPolicy.ts'
import { canManageReservation } from '#shared/localDate.ts'

definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

interface CourtBooking {
  id: string
  status: string
  payment?: { status?: string; amount?: number; metadataJson?: string | null } | null
  paymentStatus?: string | null
  seasonBookingId?: string | null
  seasonSessionCount?: number | null
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
        addressFa?: string | null
        addressEn?: string | null
        phone?: string | null
        cancellationWindowHours: number
        rescheduleWindowHours?: number
      }
    }
  }
}

interface CoachSessionRow {
  id: string
  status: string
  date: string
  startTime: string
  price?: number
  paymentStatus?: string | null
  payment?: { status?: string; amount?: number; metadataJson?: string | null } | null
  coach: {
    id: string
    nameFa?: string
    nameEn?: string
    photo?: string | null
    club?: { cancellationWindowHours?: number | null } | null
  }
}

type HistoryKind = 'court' | 'coach' | 'package'
type HistoryItem = {
  id: string
  kind: HistoryKind
  status: string
  date: string
  title: string
  subtitle: string
  address: string
  phone: string
  timeLabel: string
  price: number
  paymentStatus?: string | null
  slug?: string
  coachId?: string
  image?: string
  equipmentLines: string[]
  seasonLabel: string
  raw: CourtBooking | null
}

const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency, formatTimeRange, formatTimeLabel, formatNumber, formatYear, formatIsoDate, formatFaDigits, formatWeekday } = useFormatters()
const { today } = useLocalDate()
const { fetchErrorMessage } = useFetchError()
const { pilotNoCoach } = usePilotFlags()
const { data, pending, error, refresh } = await useAuthedFetch<{
  courtBookings?: CourtBooking[]
  coachSessions?: CoachSessionRow[]
  packageBookings?: unknown[]
}>('/api/bookings/mine')
const { data: wallet } = await useAuthedFetch<{ balance?: number }>('/api/wallet', { lazy: true })
const {
  paymentStatusLabel,
  paymentStatusBadgeClass,
  isPayAtClubStatus,
  paidHonestyNote,
} = useBookingLabels()
const { onlineEnabled, startCheckout, canPayOnline, canCoverWithWallet, isPaid } = useCheckout()
const payingId = ref<string | null>(null)
const actionError = ref('')
const paymentFlash = ref('')
const paymentFlashTone = ref<'success' | 'error'>('success')
const rescheduleTarget = ref<CourtBooking | null>(null)
const rescheduleDate = ref(today())
const rescheduleSlotId = ref('')
const reschedulePending = ref(false)
type DisplayStatus = 'paid' | 'unpaid' | 'done' | 'cancelled'
type StatusFilter = 'all' | 'unpaid' | 'paid' | 'cancelled'
type TimeFilter = 'upcoming' | 'past'
const statusFilter = ref<StatusFilter>('all')
const timeFilter = ref<TimeFilter>('upcoming')
const isWide = ref(false)
const WIDE_MQ = '(min-width: 900px)'

function syncWide() {
  if (!import.meta.client) return
  isWide.value = window.matchMedia(WIDE_MQ).matches
}

let wideMq: MediaQueryList | null = null
onMounted(() => {
  syncWide()
  if (!import.meta.client) return
  wideMq = window.matchMedia(WIDE_MQ)
  wideMq.addEventListener('change', syncWide)
})
onUnmounted(() => {
  wideMq?.removeEventListener('change', syncWide)
})
const monthAnchor = ref(today())
const selectedDayIso = ref<string | null>(null)
const detailKey = ref<string | null>(null)
const confirmingCancel = ref(false)
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

const monthLabel = computed(() => `${PERSIAN_MONTHS[viewMonth.value - 1]} ${formatYear(viewYear.value)}`)

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
  // Keep the tapped day selected (second tap clears). Do not bounce monthAnchor first —
  // that remount feel made the highlight look like it disappeared.
  if (selectedDayIso.value === iso) {
    selectedDayIso.value = null
    return
  }
  selectedDayIso.value = iso
  const j = isoToJalaali(iso)
  if (j.jy !== viewYear.value || j.jm !== viewMonth.value) {
    viewYear.value = j.jy
    viewMonth.value = j.jm
    monthAnchor.value = iso
  }
}

const route = useRoute()
const highlightBookingId = computed(() => {
  if (typeof route.query.booking === 'string') return route.query.booking
  if (typeof route.query.coachSession === 'string') return route.query.coachSession
  return ''
})

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

const { data: replacementSlots, refresh: refreshSlots } = await useAuthedFetch<Array<{
  id: string
  startTime: string
  court: { nameFa?: string; nameEn?: string }
}>>('/api/slots/available', {
  query: computed(() => ({
    club: rescheduleTarget.value?.slot?.court?.club?.slug,
    date: rescheduleDate.value,
  })),
  immediate: false,
})

const rescheduleWindowHours = computed(() =>
  rescheduleTarget.value?.slot?.court?.club?.rescheduleWindowHours ?? 24,
)

/** Available API omits past slots only — hide ones still inside the club reschedule window. */
const visibleReplacementSlots = computed(() => {
  const date = rescheduleDate.value
  const hours = rescheduleWindowHours.value
  return (replacementSlots.value || []).filter((slot) =>
    canManageReservation(date, slot.startTime, hours),
  )
})

const rescheduleEmptyMessage = computed(() => {
  if (!rescheduleTarget.value || !replacementSlots.value) return ''
  if (replacementSlots.value.length === 0) return t('booking.noSlots')
  if (visibleReplacementSlots.value.length === 0) return t('booking.noSlotsInWindow')
  return ''
})

watch(rescheduleDate, () => {
  if (!rescheduleTarget.value) return
  rescheduleSlotId.value = ''
  actionError.value = ''
})

watch(visibleReplacementSlots, (slots) => {
  if (rescheduleSlotId.value && !slots.some((slot) => slot.id === rescheduleSlotId.value)) {
    rescheduleSlotId.value = ''
  }
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
  actionError.value = ''
}

function itemKey(item: HistoryItem) {
  return `${item.kind}-${item.id}`
}

function openDetail(item: HistoryItem) {
  actionError.value = ''
  confirmingCancel.value = false
  detailKey.value = itemKey(item)
}

function closeDetail() {
  if (cancelPending.value) return
  detailKey.value = null
  confirmingCancel.value = false
}

/** iOS Safari: let the AppModal leave transition finish before another sheet opens. */
function waitSheetLeave() {
  return new Promise((resolve) => setTimeout(resolve, 220))
}

async function rescheduleFromDetail(item: HistoryItem) {
  if (!isWide.value) {
    closeDetail()
    await waitSheetLeave()
  }
  await openReschedule(item.raw as CourtBooking)
}

function closeNotice() {
  noticeBody.value = ''
}

async function confirmCancel() {
  const item = detailItem.value
  if (!item) return
  if (!canCancel(item)) {
    actionError.value = t('booking.errors.slotAlreadyStarted')
    confirmingCancel.value = false
    return
  }
  const { kind, id } = item
  cancelPending.value = true
  actionError.value = ''
  try {
    const endpoint = kind === 'court'
      ? `/api/bookings/${id}/cancel`
      : kind === 'coach'
        ? `/api/coach-sessions/${id}/cancel`
        : `/api/package-bookings/${id}/cancel`
    const result = await $fetch<{
      refund?: { walletCredited?: boolean; refunded?: boolean }
      moneyOutcome?: 'full_wallet_refund' | 'zero_refund'
    }>(endpoint, { method: 'PATCH' })
    const notice = result.moneyOutcome === 'zero_refund'
      ? t('booking.refundNoneCancelled')
      : result.refund?.walletCredited
        ? t('booking.refundToWallet')
        : result.refund?.refunded
          ? t('booking.refundToWallet')
          : ''
    cancelPending.value = false
    closeDetail()
    await refresh()
    if (notice) {
      await waitSheetLeave()
      noticeBody.value = notice
    }
  }
  catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
    confirmingCancel.value = false
  }
  finally {
    cancelPending.value = false
  }
}

async function payBooking(item: HistoryItem, useWallet = false) {
  if (payingId.value) return
  payingId.value = item.id
  actionError.value = ''
  try {
    await startCheckout(
      item.kind === 'coach'
        ? { coachSessionId: item.id, useWallet }
        : item.kind === 'package'
          ? { packageBookingId: item.id, useWallet }
          : { bookingId: item.id, useWallet },
    )
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
  const target = visibleReplacementSlots.value.find((slot) => slot.id === rescheduleSlotId.value)
  if (!target || !canManageReservation(rescheduleDate.value, target.startTime, rescheduleWindowHours.value)) {
    actionError.value = t('booking.errors.startTimeTooSoon')
    rescheduleSlotId.value = ''
    return
  }
  if (!canManageReservation(
    rescheduleTarget.value.slot.date,
    rescheduleTarget.value.slot.startTime,
    rescheduleWindowHours.value,
  )) {
    actionError.value = t('booking.errors.rescheduleWindowPassed')
    return
  }
  actionError.value = ''
  reschedulePending.value = true
  try {
    await $fetch(`/api/bookings/${rescheduleTarget.value.id}/reschedule`, {
      method: 'PATCH',
      body: { slotId: rescheduleSlotId.value },
    })
    rescheduleTarget.value = null
    rescheduleSlotId.value = ''
    actionError.value = ''
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
    const courtName = formatFaDigits(localizedField(b.slot.court, 'nameFa', 'nameEn'))
    const clubName = localizedField(b.slot.court.club, 'nameFa', 'nameEn')
    const equipLines = (b.bookingEquipments || []).map((row) => {
      const name = row.equipment ? formatFaDigits(localizedField(row.equipment, 'nameFa', 'nameEn')) : ''
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
      subtitle: courtName,
      address: localizedField(b.slot.court.club, 'addressFa', 'addressEn') || '',
      phone: b.slot.court.club.phone || '',
      timeLabel: formatTimeLabel(b.slot.startTime),
      price: athleteListPrice({
        meta: parseSeriesPaymentMeta(b.payment?.metadataJson),
        paymentAmount: b.payment?.amount,
        slotPrice: b.slot.price || 0,
      }),
      paymentStatus: paymentOf(b),
      slug: b.slot.court.club.slug,
      image: b.slot.court.image || b.slot.court.club.image || '/placeholders/club.svg',
      equipmentLines: equipLines,
      seasonLabel: b.seasonBookingId && b.seasonSessionCount && b.seasonSessionCount > 1
        ? t('booking.seasonSeriesLabel', { count: formatNumber(b.seasonSessionCount) })
        : '',
      raw: b,
    })
  }
  // Package history stays frozen; coach sessions list only when the coach product is on.
  if (!pilotNoCoach.value) {
    for (const s of (data.value?.coachSessions || []) as CoachSessionRow[]) {
      items.push({
        id: s.id,
        kind: 'coach',
        status: s.status,
        date: s.date,
        title: localizedField(s.coach, 'nameFa', 'nameEn'),
        subtitle: t('home.findCoach'),
        address: '',
        phone: '',
        timeLabel: formatTimeLabel(s.startTime),
        price: athleteListPrice({
          meta: parseSeriesPaymentMeta(s.payment?.metadataJson),
          paymentAmount: s.payment?.amount,
          slotPrice: s.price || 0,
        }),
        paymentStatus: paymentOf(s),
        coachId: s.coach.id,
        image: s.coach.photo || '/placeholders/coach.svg',
        equipmentLines: [],
        seasonLabel: '',
        raw: null,
      })
    }
  }
  return items
})

const detailItem = computed(() =>
  historyItems.value.find((item) => itemKey(item) === detailKey.value) || null,
)

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

const timeScopedHistory = computed(() => {
  const todayIso = today()
  if (timeFilter.value === 'upcoming') {
    return historyItems.value.filter((item) => item.status !== 'CANCELLED' && item.date >= todayIso)
  }
  return historyItems.value.filter((item) => item.status === 'CANCELLED' || item.date < todayIso)
})

const visibleHistory = computed(() => {
  if (timeFilter.value === 'upcoming' && !selectedDayIso.value) return timeScopedHistory.value
  const key = `${viewYear.value}-${String(viewMonth.value).padStart(2, '0')}`
  return timeScopedHistory.value.filter((item) => monthKeyJalali(item.date) === key)
})

function historyStatus(item: HistoryItem): 'done' | 'pending' | 'cancelled' {
  if (item.status === 'CANCELLED') return 'cancelled'
  if (item.date < today()) return 'done'
  return 'pending'
}

/** Badge / dot status: payment state for live bookings; past unpaid rows read as done, not «awaiting payment». */
function displayStatus(item: HistoryItem): DisplayStatus {
  if (item.status === 'CANCELLED') return 'cancelled'
  if (isPaid(item.paymentStatus)) return 'paid'
  return item.date < today() ? 'done' : 'unpaid'
}

const STATUS_LABEL_KEY: Record<DisplayStatus, string> = {
  paid: 'athlete.historyStatusPaid',
  unpaid: 'athlete.historyStatusUnpaid',
  done: 'athlete.historyStatusDone',
  cancelled: 'athlete.historyStatusCancelled',
}

const STATUS_NOTE_KEY: Record<DisplayStatus, string> = {
  paid: 'athlete.historyNotePaid',
  unpaid: 'athlete.historyNoteUnpaid',
  done: 'athlete.historyNoteDone',
  cancelled: 'athlete.historyNoteCancelled',
}

/** Literal names so Tailwind keeps these `@layer components` classes in the build. */
const DOT_CLASS: Record<DisplayStatus, string> = {
  paid: 'canva-history-dot-paid',
  unpaid: 'canva-history-dot-unpaid',
  done: 'canva-history-dot-done',
  cancelled: 'canva-history-dot-cancelled',
}

const BADGE_CLASS: Record<DisplayStatus, string> = {
  paid: 'canva-history-badge-paid',
  unpaid: 'canva-history-badge-unpaid',
  done: 'canva-history-badge-done',
  cancelled: 'canva-history-badge-cancelled',
}

const legendStatuses: DisplayStatus[] = ['paid', 'unpaid', 'done', 'cancelled']

const timeChips: Array<{ value: TimeFilter; labelKey: string }> = [
  { value: 'upcoming', labelKey: 'athlete.historyFilterUpcoming' },
  { value: 'past', labelKey: 'athlete.historyFilterPast' },
]

const statusChips: Array<{ value: StatusFilter; labelKey: string }> = [
  { value: 'all', labelKey: 'athlete.historyFilterAll' },
  { value: 'unpaid', labelKey: 'athlete.historyStatusUnpaid' },
  { value: 'paid', labelKey: 'athlete.historyStatusPaid' },
  { value: 'cancelled', labelKey: 'athlete.historyStatusCancelled' },
]

const summary = computed(() => {
  const todayIso = today()
  const live = historyItems.value.filter((item) => item.status !== 'CANCELLED' && item.date >= todayIso)
  return {
    upcoming: live.length,
    unpaid: live.filter((item) => !isPaid(item.paymentStatus)).length,
    cancelled: historyItems.value.filter((item) => item.status === 'CANCELLED').length,
  }
})

const dayStatuses = computed(() => {
  const map = new Map<string, DisplayStatus[]>()
  for (const item of visibleHistory.value) {
    const list = map.get(item.date) || []
    const status = displayStatus(item)
    if (!list.includes(status)) list.push(status)
    map.set(item.date, list)
  }
  return map
})

function statusesOn(iso: string | null) {
  return (iso && dayStatuses.value.get(iso)) || []
}

function dayAriaLabel(iso: string) {
  const count = visibleHistory.value.filter((item) => item.date === iso).length
  const base = `${formatIsoDate(iso)}، ${formatWeekday(iso)}`
  return count ? `${base}، ${t('athlete.historyCount', { count: formatNumber(count) })}` : base
}

const filteredItems = computed(() => {
  let list = visibleHistory.value
  if (selectedDayIso.value) {
    list = list.filter((item) => item.date === selectedDayIso.value)
  }
  else if (statusFilter.value !== 'all') {
    list = list.filter((item) => displayStatus(item) === statusFilter.value)
  }
  // Newest first; copy so Vue sees a new array.
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.timeLabel.localeCompare(a.timeLabel))
})

const hasAnyBookings = computed(() => visibleHistory.value.length > 0)

watch(
  [filteredItems, isWide],
  () => {
    if (!isWide.value) return
    if (detailKey.value && filteredItems.value.some((item) => itemKey(item) === detailKey.value)) return
    const first = filteredItems.value[0]
    detailKey.value = first ? itemKey(first) : null
    confirmingCancel.value = false
  },
)

const listTitle = computed(() => {
  if (selectedDayIso.value) return t('athlete.historyDayList', { date: formatIsoDate(selectedDayIso.value) })
  if (timeFilter.value === 'upcoming') return t('athlete.historyUpcomingList')
  return t('athlete.historyPastList')
})

const historyEmptyTitle = computed(() => {
  if (selectedDayIso.value) return t('athlete.historyEmptyDay')
  if (statusFilter.value !== 'all' && hasAnyBookings.value) return t('athlete.historyEmptyStatus')
  return t('athlete.historyEmptyMonth')
})

const historyEmptyBody = computed(() => {
  if (selectedDayIso.value) {
    return hasAnyBookings.value
      ? t('athlete.historyEmptyDayFilterBody')
      : t('athlete.historyEmptyDayBody')
  }
  if (statusFilter.value !== 'all' && hasAnyBookings.value) return t('athlete.historyEmptyStatusBody')
  return t('athlete.historyEmptyMonthBody')
})

function clearListFilters() {
  selectedDayIso.value = null
  statusFilter.value = 'all'
  timeFilter.value = 'upcoming'
}

function seasonProgress(item: HistoryItem) {
  const raw = item.raw
  if (!raw?.seasonBookingId || !raw.seasonSessionCount || raw.seasonSessionCount < 2) return null
  const done = historyItems.value.filter((row) => (
    row.raw?.seasonBookingId === raw.seasonBookingId
    && row.status !== 'CANCELLED'
    && row.date < today()
  )).length
  return { done, total: raw.seasonSessionCount }
}

function clubRulesFor(item: HistoryItem) {
  const hours = item.raw?.slot.court.club.cancellationWindowHours
    ?? item.raw?.slot.court.club.rescheduleWindowHours
    ?? 12
  return t('athlete.historyClubRules', { hours: formatNumber(hours) })
}

function rebookTo(item: HistoryItem) {
  if (item.kind === 'coach') {
    return item.coachId
      ? localePath(`/book/coach/${item.coachId}`)
      : localePath('/coaches')
  }
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
  if (item.status === 'CANCELLED' || historyStatus(item) !== 'pending') return false
  if (item.kind === 'court') {
    const slot = item.raw?.slot
    if (!slot) return false
    return canCancelReservation({
      actor: 'athlete',
      date: slot.date,
      startTime: slot.startTime,
    })
  }
  if (item.kind === 'coach') {
    const session = (data.value?.coachSessions || []).find((row) => row.id === item.id)
    if (!session) return false
    return canCancelReservation({
      actor: 'athlete',
      date: session.date,
      startTime: session.startTime,
    })
  }
  if (item.kind === 'package') {
    // Server enforces first-session start; allow UI attempt until then.
    return true
  }
  return true
}

function cancelIsZeroRefund(item: HistoryItem) {
  if (item.kind === 'court') {
    const slot = item.raw?.slot
    if (!slot) return false
    const hours = slot.court.club.cancellationWindowHours ?? 12
    return !canManageReservation(slot.date, slot.startTime, hours)
  }
  if (item.kind === 'coach') {
    const session = (data.value?.coachSessions || []).find((row) => row.id === item.id)
    if (!session) return false
    const hours = session.coach?.club?.cancellationWindowHours ?? 12
    return !canManageReservation(session.date, session.startTime, hours)
  }
  return false
}

function canReschedule(item: HistoryItem) {
  if (item.kind !== 'court' || item.status === 'CANCELLED' || historyStatus(item) !== 'pending') return false
  const booking = item.raw
  if (!booking?.slot) return false
  const hours = booking.slot.court.club.rescheduleWindowHours ?? 24
  return canManageReservation(booking.slot.date, booking.slot.startTime, hours)
}

function canRebook(item: HistoryItem) {
  return item.status === 'CANCELLED' || historyStatus(item) === 'done'
}

function dateLine(item: HistoryItem) {
  return `${formatIsoDate(item.date)} · ${t('athlete.historyAtTime')} ${item.timeLabel}`
}
</script>

<template>
  <div class="venus-page-stack">
    <CanvaAthleteChrome>
      <NuxtLink :to="localePath('/athlete/notifications')" :aria-label="t('notifications.title')">
        <AppIcon name="notifications" size="sm" />
      </NuxtLink>
    </CanvaAthleteChrome>

    <h1 class="canva-history-title">{{ t('athlete.historyTitle') }}</h1>

    <div class="canva-history-sum" :aria-label="t('athlete.historySummaryAria')">
      <div>
        <span>{{ t('athlete.historySummaryUpcoming') }}</span>
        <b class="canva-history-sum-paid">{{ formatNumber(summary.upcoming) }}</b>
      </div>
      <div>
        <span>{{ t('athlete.historySummaryUnpaid') }}</span>
        <b class="canva-history-sum-unpaid">{{ formatNumber(summary.unpaid) }}</b>
      </div>
      <div>
        <span>{{ t('athlete.historySummaryCancelled') }}</span>
        <b class="canva-history-sum-cancelled">{{ formatNumber(summary.cancelled) }}</b>
      </div>
    </div>

    <div class="canva-history-desktop">
    <section :aria-label="t('athlete.historyCalendarAria')">
      <div class="canva-history-cal">
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
                'canva-history-cal-day-today': cell.iso === today(),
                'canva-history-cal-day-dotted': statusesOn(cell.iso).length > 0,
              }"
              :aria-label="dayAriaLabel(cell.iso)"
              :aria-pressed="cell.iso === selectedDayIso"
              @click="selectDay(cell.iso!)"
            >
              <span>{{ formatNumber(cell.day) }}</span>
              <span v-if="statusesOn(cell.iso).length" class="canva-history-cal-dots" aria-hidden="true">
                <i
                  v-for="status in statusesOn(cell.iso)"
                  :key="status"
                  class="canva-history-dot"
                  :class="DOT_CLASS[status]"
                />
              </span>
            </button>
            <span v-else class="canva-history-cal-day canva-history-cal-day-empty" />
          </template>
        </div>
        <div class="canva-history-legend">
          <span v-for="status in legendStatuses" :key="status">
            <i class="canva-history-dot" :class="DOT_CLASS[status]" />{{ t(STATUS_LABEL_KEY[status]) }}
          </span>
        </div>
      </div>
      <p class="canva-history-hint">{{ t('athlete.historyCalHint') }}</p>
    </section>

    <section class="canva-history-desktop-main" :aria-label="t('athlete.historyListAria')">
      <div class="canva-history-head">
        <h2 class="canva-history-list-title">{{ listTitle }}</h2>
        <button v-if="selectedDayIso" type="button" class="canva-history-show-all" @click="selectedDayIso = null">
          {{ t('athlete.historyShowAll') }}
        </button>
        <span v-else-if="filteredItems.length" class="canva-history-count">
          {{ t('athlete.historyCount', { count: formatNumber(filteredItems.length) }) }}
        </span>
      </div>

      <div class="canva-history-chips" role="group" :aria-label="t('athlete.historyTimeFilterGroup')">
        <button
          v-for="chip in timeChips"
          :key="chip.value"
          type="button"
          class="canva-history-chip"
          :class="{ 'canva-history-chip-on': timeFilter === chip.value }"
          :aria-pressed="timeFilter === chip.value"
          @click="timeFilter = chip.value; selectedDayIso = null"
        >
          {{ t(chip.labelKey) }}
        </button>
      </div>

      <div v-if="!selectedDayIso" class="canva-history-chips" role="group" :aria-label="t('athlete.historyFilterGroup')">
        <button
          v-for="chip in statusChips"
          :key="chip.value"
          type="button"
          class="canva-history-chip"
          :class="{ 'canva-history-chip-on': statusFilter === chip.value }"
          :aria-pressed="statusFilter === chip.value"
          @click="statusFilter = chip.value"
        >
          {{ t(chip.labelKey) }}
        </button>
      </div>

      <p
        v-if="paymentFlash"
        class="text-sm"
        :class="paymentFlashTone === 'success' ? 'canva-flash-success' : 'canva-flash-error'"
      >
        {{ paymentFlash }}
      </p>
      <p v-if="actionError && !rescheduleTarget && !detailItem" class="canva-flash-error">{{ actionError }}</p>

      <AppAsyncState :pending="pending" :error="error" :empty="Boolean(data) && !historyItems.length" skeleton-variant="table">
        <CanvaEmptyState
          v-if="!filteredItems.length"
          :title="historyEmptyTitle"
          :body="historyEmptyBody"
          doodle="seat"
        >
          <button
            v-if="(selectedDayIso || statusFilter !== 'all') && hasAnyBookings"
            type="button"
            class="canva-gate-btn-secondary mt-3 px-4 py-2 text-xs font-bold"
            @click="clearListFilters"
          >
            {{ t('athlete.historyShowAll') }}
          </button>
        </CanvaEmptyState>
        <div v-else class="canva-history-dash">
          <div class="canva-history-card-grid">
            <button
              v-for="item in filteredItems"
              :id="`booking-${item.id}`"
              :key="itemKey(item)"
              type="button"
              class="canva-history-bk"
              :class="{ 'canva-history-bk-sel': itemKey(item) === detailKey }"
              :aria-label="t('athlete.historyDetailsAria', { title: item.title, date: formatIsoDate(item.date) })"
              :aria-pressed="itemKey(item) === detailKey"
              @click="openDetail(item)"
            >
              <img
                :src="item.image || '/placeholders/club.svg'"
                alt=""
                class="canva-history-bk-media"
              >
              <span class="canva-history-bk-mid">
                <span class="canva-history-card-row">
                  <span class="canva-history-card-title">{{ item.title }}</span>
                  <span class="canva-history-badge" :class="BADGE_CLASS[displayStatus(item)]">
                    {{ t(STATUS_LABEL_KEY[displayStatus(item)]) }}
                  </span>
                </span>
                <span class="canva-history-card-meta">
                  <template v-if="item.subtitle">{{ item.subtitle }} · </template>{{ dateLine(item) }}
                </span>
                <span class="canva-history-card-price mt-1 block">{{ formatCurrency(item.price) }}</span>
                <span v-if="item.seasonLabel" class="canva-history-bk-note">{{ item.seasonLabel }}</span>
                <span class="canva-history-bk-note">{{ t(STATUS_NOTE_KEY[displayStatus(item)]) }}</span>
                <span v-if="seasonProgress(item)" class="canva-history-prog">
                  <span class="canva-history-prog-track" aria-hidden="true">
                    <i
                      class="canva-history-prog-bar"
                      :style="{ width: `${Math.min(100, Math.round((seasonProgress(item)!.done / seasonProgress(item)!.total) * 100))}%` }"
                    />
                  </span>
                  <span>{{ t('athlete.historyProgress', {
                    done: formatNumber(seasonProgress(item)!.done),
                    total: formatNumber(seasonProgress(item)!.total),
                  }) }}</span>
                </span>
              </span>
            </button>
          </div>
          <aside class="canva-history-detail-pane" :aria-label="t('athlete.historyDetails')">
            <AthleteBookingDetailPane
              v-if="detailItem"
              :item="detailItem"
              :display-status="displayStatus(detailItem)"
              :status-label="t(STATUS_LABEL_KEY[displayStatus(detailItem)])"
              :status-note="t(STATUS_NOTE_KEY[displayStatus(detailItem)])"
              :status-badge-class="BADGE_CLASS[displayStatus(detailItem)]"
              :weekday-line="`${formatIsoDate(detailItem.date)} · ${formatWeekday(detailItem.date, 'long')}`"
              :pay-at-club-note="detailItem.status !== 'CANCELLED' && isPayAtClubStatus(detailItem.paymentStatus) ? t('booking.payAtClubDetail') : ''"
              :honesty-note="detailItem.status !== 'CANCELLED' ? (paidHonestyNote(detailItem.paymentStatus) || '') : ''"
              :zero-refund-note="detailItem.status !== 'CANCELLED' && historyStatus(detailItem) === 'pending' && canCancel(detailItem) && cancelIsZeroRefund(detailItem) ? t('booking.refundNoneInsideWindow') : ''"
              :club-rules="clubRulesFor(detailItem)"
              :action-error="actionError"
              :paying="payingId === detailItem.id"
              :confirming-cancel="confirmingCancel"
              :cancel-pending="cancelPending"
              :show-pay-online="detailItem.status !== 'CANCELLED' && onlineEnabled && canPayOnline(detailItem.paymentStatus)"
              :show-pay-wallet="detailItem.status !== 'CANCELLED' && canCoverWithWallet(wallet?.balance, detailItem.price, detailItem.paymentStatus)"
              :show-reschedule="canReschedule(detailItem)"
              :show-cancel="canCancel(detailItem)"
              :show-rebook="canRebook(detailItem)"
              :rebook-to="rebookTo(detailItem)"
              :cancel-confirm-body="cancelIsZeroRefund(detailItem) ? t('booking.confirmCancelNoRefund') : t('booking.confirmCancel')"
              :pay-online-label="payingId === detailItem.id ? t('booking.redirectingToGateway') : `${t('booking.payNow')} · ${formatCurrency(detailItem.price)}`"
              @pay="payBooking(detailItem, $event)"
              @reschedule="rescheduleFromDetail(detailItem)"
              @cancel-ask="actionError = ''; confirmingCancel = true"
              @cancel-yes="confirmCancel"
              @cancel-no="confirmingCancel = false"
            />
            <p v-else class="canva-history-detail-empty">{{ t('athlete.historySelectHint') }}</p>
          </aside>
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
    </section>
    </div>

    <AppModal
      :open="Boolean(detailItem) && !isWide"
      patterned
      sheet
      close-icon
      max-width-class="canva-phone-shell max-w-sm"
      :title="detailItem?.title || ''"
      @close="closeDetail"
    >
      <div v-if="detailItem" class="canva-auth-body px-5 pb-[max(1.5rem,var(--sz-safe-bottom))] pt-2">
        <AthleteBookingDetailPane
          :item="detailItem"
          :display-status="displayStatus(detailItem)"
          :status-label="t(STATUS_LABEL_KEY[displayStatus(detailItem)])"
          :status-note="t(STATUS_NOTE_KEY[displayStatus(detailItem)])"
          :status-badge-class="BADGE_CLASS[displayStatus(detailItem)]"
          :weekday-line="`${formatIsoDate(detailItem.date)} · ${formatWeekday(detailItem.date, 'long')}`"
          :pay-at-club-note="detailItem.status !== 'CANCELLED' && isPayAtClubStatus(detailItem.paymentStatus) ? t('booking.payAtClubDetail') : ''"
          :honesty-note="detailItem.status !== 'CANCELLED' ? (paidHonestyNote(detailItem.paymentStatus) || '') : ''"
          :zero-refund-note="detailItem.status !== 'CANCELLED' && historyStatus(detailItem) === 'pending' && canCancel(detailItem) && cancelIsZeroRefund(detailItem) ? t('booking.refundNoneInsideWindow') : ''"
          :club-rules="clubRulesFor(detailItem)"
          :action-error="actionError"
          :paying="payingId === detailItem.id"
          :confirming-cancel="confirmingCancel"
          :cancel-pending="cancelPending"
          :show-pay-online="detailItem.status !== 'CANCELLED' && onlineEnabled && canPayOnline(detailItem.paymentStatus)"
          :show-pay-wallet="detailItem.status !== 'CANCELLED' && canCoverWithWallet(wallet?.balance, detailItem.price, detailItem.paymentStatus)"
          :show-reschedule="canReschedule(detailItem)"
          :show-cancel="canCancel(detailItem)"
          :show-rebook="canRebook(detailItem)"
          :rebook-to="rebookTo(detailItem)"
          :cancel-confirm-body="cancelIsZeroRefund(detailItem) ? t('booking.confirmCancelNoRefund') : t('booking.confirmCancel')"
          :pay-online-label="payingId === detailItem.id ? t('booking.redirectingToGateway') : `${t('booking.payNow')} · ${formatCurrency(detailItem.price)}`"
          @pay="payBooking(detailItem, $event)"
          @reschedule="rescheduleFromDetail(detailItem)"
          @cancel-ask="actionError = ''; confirmingCancel = true"
          @cancel-yes="confirmCancel"
          @cancel-no="confirmingCancel = false"
        />
      </div>
    </AppModal>

    <AppModal
      :open="Boolean(rescheduleTarget)"
      patterned
      sheet
      max-width-class="canva-phone-shell max-w-sm"
      :title="t('booking.reschedule')"
      @close="closeReschedule"
    >
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div class="canva-auth-body min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-4 pt-2">
          <AppDateInput v-model="rescheduleDate" :min-date="today()" />
          <div class="space-y-2">
            <button
              v-for="slot in visibleReplacementSlots"
              :key="slot.id"
              type="button"
              class="w-full border border-brand-gray-200 bg-white/95 px-3 py-3 text-start text-sm text-brand-navy"
              :class="rescheduleSlotId === slot.id ? 'border-brand-primary bg-brand-primary-soft/50' : ''"
              style="border-radius: var(--sz-canva-radius);"
              @click="actionError = ''; rescheduleSlotId = slot.id"
            >
              {{ formatFaDigits(localizedField(slot.court, 'nameFa', 'nameEn')) }} · <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(slot.startTime) }}</bdi>
            </button>
            <p v-if="rescheduleEmptyMessage" class="text-sm text-brand-gray-600">
              {{ rescheduleEmptyMessage }}
            </p>
          </div>
        </div>
        <div class="relative z-[1] shrink-0 space-y-2 px-5 pb-[max(1.5rem,var(--sz-safe-bottom))] pt-1">
          <p v-if="actionError && rescheduleTarget" class="canva-flash-error text-start text-xs">{{ actionError }}</p>
          <button
            type="button"
            class="canva-gate-btn-primary w-full"
            :disabled="!rescheduleSlotId || reschedulePending"
            @click="rescheduleCourt"
          >
            {{ reschedulePending ? t('common.loading') : t('booking.confirmReschedule') }}
          </button>
          <button type="button" class="canva-gate-btn-secondary w-full" :disabled="reschedulePending" @click="closeReschedule">
            {{ t('common.close') }}
          </button>
        </div>
      </div>
    </AppModal>

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
