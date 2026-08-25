<script setup lang="ts">
import { isoToJalaali, jalaaliDaysInMonth, jalaaliToIso, PERSIAN_MONTHS } from '#shared/jalali.ts'
import { palette } from '#shared/palette.ts'
import { isPaidPaymentStatus, isUnpaidPaymentStatus, resolvePaymentChannel } from '#shared/bookingPayment.ts'
import { addDaysToIsoDate, isPastDate, isSlotStartInPast } from '#shared/localDate.ts'
import {
  countRecurringSessionsByDayInRange,
  ensureDayTimesForDays,
  hasValidDayTimes,
  weekdayNameFromDate,
  type DayTimeRange,
} from '#shared/recurringSessions.ts'
import { buildHourlyOptions } from '#shared/courtFacilities.ts'
import { isRecurringReserveEnabled } from '#shared/recurringReserve.ts'
import { bookingTimeRange } from '#shared/bookingTimeRange.ts'
import { whatsappHrefForIranMobile } from '#shared/payPin.ts'
import {
  checkedBookedSlots,
  checkedDeskReversiblePaidSlots,
  checkedUnpaidBookedSlots,
  deskReserveSelectionIssue,
  isCancellableBookedSlot,
  joinWithAnd,
  siblingBookedSlots,
  sortSlotsByTimeThenCourt,
  toggleBookedSlotSelection,
  uniqueOrdered,
} from '#shared/courtSlotSelection.ts'
import { formatGuestDisplayName, normalizeGuestNamePair } from '#shared/guestName.ts'
import { clampDiscountPercent } from '#shared/discountCode.ts'
import { resolveDeskCharge } from '#shared/deskCharge.ts'
import {
  minAvailableEquipmentAcrossTimes,
  normalizeSlotTime,
} from '#shared/equipmentAvailability.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

interface OwnerCalendarBookingEquipment {
  equipmentId: string
  priceAtBooking: number
  quantity?: number
  equipment?: { id: string; nameFa: string; nameEn: string; price: number; category: string; quantity?: number } | null
}

interface OwnerCalendarBooking {
  id?: string
  status?: string | null
  source?: string | null
  guestName?: string | null
  guestFamily?: string | null
  guestMobile?: string | null
  coachId?: string | null
  payment?: { method?: string; status?: string; amount?: number } | null
  paymentMethod?: string | null
  paymentStatus?: string | null
  comments?: string | null
  bookingEquipments?: OwnerCalendarBookingEquipment[]
}

interface OwnerCalendarSlot {
  id: string
  courtId: string
  date?: string
  price?: number
  startTime: string
  endTime: string
  displayStatus: string
  booking?: OwnerCalendarBooking | null
}

interface OwnerEquipment {
  id: string
  nameFa: string
  nameEn: string
  category: string
  price: number
  quantity?: number
}

interface OwnerCalendarCourt {
  id: string
  nameFa: string
  nameEn: string
  effectiveOpenHour?: number
  effectiveCloseHour?: number
}

interface OwnerCalendarResponse {
  date?: string
  courts?: OwnerCalendarCourt[]
  slots?: OwnerCalendarSlot[]
  clubOpenHour?: number
  clubCloseHour?: number
  sessionDurationMinutes?: number
  busyDates?: string[]
  softDates?: string[]
}

interface OwnerStaffCoach {
  id: string
  nameFa: string
  nameEn: string
  sessionPrice?: number
}

interface OwnerStaffMember {
  id: string
  role: string
  permissionsJson?: string | null
  coach?: OwnerStaffCoach | null
  user: {
    id?: string
    name: string
    nameEn?: string | null
    email?: string | null
    phone?: string | null
  }
}

interface OwnerStaffResponse {
  staff: OwnerStaffMember[]
}

type ActivePanel = 'cancel' | 'reserve' | 'payConfirm' | 'payLinkSent' | 'season' | 'package' | 'comments' | 'equipment' | 'block' | 'detail' | 'external' | null

const { t, locale } = useI18n()
const { fetchErrorMessage } = useFetchError()
const { localizedField } = useLocalizedField()
const { formatDate, formatDayNumber, formatWeekday, formatMonth, formatTimeRange, formatTimeLabel, formatNumber, formatCurrency } = useFormatters()
const { today } = useLocalDate()
const { public: { paymentsMode } } = useRuntimeConfig()
const { pilotNoCoach } = usePilotFlags()
const payAtClubMode = computed(() => (paymentsMode || 'pay_at_club') === 'pay_at_club')

const date = ref(today())
const showDatePicker = ref(false)
const datePickerRef = ref<HTMLElement | null>(null)
const activeCourtId = ref<string | null>(null)
const calendarView = ref<'today' | 'overview'>('today')
const selectedSlot = ref<OwnerCalendarSlot | null>(null)
const selectedSlotIds = ref<string[]>([])
/** Stable sibling set for booked cancel checkboxes (survives unchecking). */
const bookedSiblingIds = ref<string[]>([])
const selectionCourtId = ref<string | null>(null)
const multiSelectMode = ref(false)
const showMenu = ref(false)
const activePanel = ref<ActivePanel>(null)
const cancelReason = ref('')
const refundToWallet = ref(true)
const saving = ref(false)
const actionError = ref('')
const lastPayLink = ref<{ url: string; pin: string; mobile: string } | null>(null)
const payLinkCopied = ref(false)
/** Canva reserve sheet: آزاد / مربی (coach path still MVP-gated). */
const sessionType = ref<'free' | 'coach'>('free')

const weekdayOptions = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const form = reactive({
  guestName: '',
  guestFamily: '',
  guestMobile: '',
  paymentMethod: 'CASH',
  paymentStatus: 'PAY_AT_CLUB',
  comments: '',
  equipmentIds: [] as string[],
  equipmentQuantities: {} as Record<string, number>,
  displayStatus: 'RESERVED',
})

const seasonForm = reactive({
  startDate: '',
  finishDate: '',
  days: ['Sun'] as string[],
  dayTimes: {} as Record<string, DayTimeRange>,
  equipmentId: '',
  comments: '',
})

const packageForm = reactive({
  coachId: '',
  startDate: '',
  finishDate: '',
  days: ['Sun'] as string[],
  dayTimes: {} as Record<string, DayTimeRange>,
  equipmentId: '',
  comments: '',
})

const { data: equipments } = await useAuthedFetch<OwnerEquipment[]>('/api/owner/equipments')
const { data: staffData } = await useAuthedFetch<OwnerStaffResponse>('/api/owner/staff')

const { data, pending, error, refresh } = await useAuthedFetch<OwnerCalendarResponse>('/api/owner/calendar', {
  query: computed(() => ({ date: date.value })),
})

const {
  isExternalOnlyOccupied,
  externalSiteBadge,
  externalSourceDetails,
  refreshExternalOverlay,
} = useOwnerExternalCalendarOverlay({ date })

async function refreshCalendar() {
  await Promise.all([refresh(), refreshExternalOverlay()])
}

useOwnerClubRefresh(refreshCalendar)

watch(date, () => {
  clearSelection()
  void refreshCalendar()
})

async function loadOccupancyMarks() {
  const j = isoToJalaali(date.value)
  const from = jalaaliToIso(j.jy, j.jm, 1)
  const to = jalaaliToIso(j.jy, j.jm, jalaaliDaysInMonth(j.jy, j.jm))
  try {
    const month = await $fetch<{ busyDates?: string[]; softDates?: string[] }>('/api/owner/calendar', {
      query: { from, to },
    })
    const marks: Record<string, 'busy' | 'soft'> = {}
    for (const iso of month.softDates || []) marks[iso] = 'soft'
    for (const iso of month.busyDates || []) marks[iso] = 'busy'
    occupancyMarks.value = marks
  } catch {
    occupancyMarks.value = {}
  }
}

watch(showDatePicker, (open) => {
  if (open) loadOccupancyMarks()
})

const hours = computed(() => {
  const set = new Set<string>()
  data.value?.slots?.forEach((s) => set.add(s.startTime))
  return [...set].sort()
})

const courts = computed(() => data.value?.courts || [])

const gridTemplateColumns = computed(() => {
  const courtCount = Math.max(courts.value.length, 1)
  // RTL: first column is the time gutter on the RIGHT, then courts going left — Canva (9).
  return `var(--canva-cal-gutter, 2.75rem) repeat(${courtCount}, minmax(var(--canva-cal-court-min, 5.5rem), 1fr))`
})

function shiftDate(delta: number) {
  date.value = addDaysToIsoDate(date.value, delta)
}

function onDatePicked() {
  showDatePicker.value = false
  calendarView.value = 'today'
}

watch(courts, (list) => {
  if (!list.length) {
    activeCourtId.value = null
    return
  }
  if (!activeCourtId.value || !list.some((court) => court.id === activeCourtId.value)) {
    activeCourtId.value = list[0]?.id ?? null
  }
}, { immediate: true })

const activeCourt = computed(() =>
  courts.value.find((court) => court.id === activeCourtId.value) || null,
)


const overviewStats = computed(() => {
  const slots = (data.value?.slots || []) as OwnerCalendarSlot[]
  const bookable = slots.filter((slot) => slot.displayStatus !== 'CLOSED')
  const free = bookable.filter((slot) => slot.displayStatus === 'FREE' && !isExternalOnlyOccupied(slot))
  const reserved = bookable.filter((slot) =>
    slot.displayStatus === 'RESERVED'
    || slot.displayStatus === 'PENDING'
    || Boolean(activeBooking(slot))
    || isExternalOnlyOccupied(slot),
  )
  const freePct = bookable.length ? Math.round((free.length / bookable.length) * 100) : 0
  const reservedPct = bookable.length ? Math.round((reserved.length / bookable.length) * 100) : 0
  const perCourt = courts.value.map((court) => {
    const courtSlots = bookable.filter((slot) => slot.courtId === court.id)
    const used = courtSlots.filter((slot) =>
      slot.displayStatus !== 'FREE' || isExternalOnlyOccupied(slot),
    ).length
    const pct = courtSlots.length ? Math.round((used / courtSlots.length) * 100) : 0
    return {
      id: court.id,
      name: localizedField(court, 'nameFa', 'nameEn'),
      pct,
      total: courtSlots.length,
      used,
    }
  })
  return {
    freePct,
    reservedPct,
    bookingsToday: reserved.length,
    bookable: bookable.length,
    free: free.length,
    perCourt,
  }
})

const scheduleTimeOptions = computed(() => {
  const court = courts.value.find((item) => item.id === selectedSlotFull.value?.courtId)
  const open = court?.effectiveOpenHour ?? data.value?.clubOpenHour ?? 8
  const close = court?.effectiveCloseHour ?? data.value?.clubCloseHour ?? 22
  const step = data.value?.sessionDurationMinutes ?? 60
  return buildHourlyOptions(open, close, step)
})
const formattedDate = computed(() => formatDate(`${date.value}T12:00:00`))
const { user } = useAuth()
const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })
const clubCalendarTitle = computed(() => {
  const memberships = user.value?.memberships || []
  const membership = memberships.find((m) => m.club.id === selectedClubId.value) || memberships[0]
  if (membership?.club) return localizedField(membership.club, 'nameFa', 'nameEn')
  return t('owner.calendar')
})
/** Keep a club switcher when the owner has more than one club (product chrome, even if Canva crop omits it). */
const ownerMemberships = computed(() => user.value?.memberships || [])
const showClubSwitcher = computed(() => ownerMemberships.value.length > 1)
const occupancyMarks = ref<Record<string, 'busy' | 'soft'>>({})
const deskDiscountInput = ref('')
const deskDiscountError = ref('')
const deskDiscountApplying = ref(false)
const deskDiscount = ref<{ code: string; percent: number; discountAmount: number } | null>(null)
const deskPercentInput = ref('')
const deskPayMode = ref<'cash' | 'unpaid' | 'complimentary'>('cash')
/** Canva owner hero uses the people/promo frame (same asset as athlete home), not club court crop. */
const clubHeroImage = '/hero/fitness-venue.jpg'

let longPressTimer: ReturnType<typeof setTimeout> | null = null
let longPressFired = false

function clearLongPressTimer() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function onSlotPointerDown(slot: OwnerCalendarSlot) {
  if (slot.displayStatus !== 'FREE' || isExternalOnlyOccupied(slot)) return
  longPressFired = false
  clearLongPressTimer()
  longPressTimer = setTimeout(() => {
    longPressFired = true
    multiSelectMode.value = true
    closeMenu()
    if (!isSlotSelected(slot)) toggleFreeSlot(slot)
  }, 450)
}

function onSlotPointerEnd() {
  clearLongPressTimer()
}

const currentDate = computed(() => new Date(`${date.value}T12:00:00`))
const clubCoaches = computed(() => {
  if (pilotNoCoach.value) return [] as OwnerStaffCoach[]
  return (staffData.value?.staff ?? [])
    .map((member) => member.coach)
    .filter((coach): coach is OwnerStaffCoach => coach != null)
})
const selectedSlotFull = computed(() => {
  if (!selectedSlot.value?.id) return null
  return data.value?.slots?.find((s) => s.id === selectedSlot.value!.id) || selectedSlot.value
})
const selectedSlotsFull = computed(() => {
  const picked = selectedSlotIds.value
    .map((id) => data.value?.slots?.find((s) => s.id === id))
    .filter(Boolean) as OwnerCalendarSlot[]
  const courtOrder = courts.value.map((court) => court.id)
  return sortSlotsByTimeThenCourt(picked, courtOrder)
})
function slotCourtName(slot: OwnerCalendarSlot | null | undefined) {
  if (!slot) return ''
  const court = courts.value.find((item) => item.id === slot.courtId)
  return court ? localizedField(court, 'nameFa', 'nameEn') : ''
}
function slotCellLabel(slot: OwnerCalendarSlot) {
  const name = slotCourtName(slot)
  const time = formatTimeLabel(slot.startTime)
  return name ? `${name} ${time}` : time
}
const selectionCourtNames = computed(() =>
  uniqueOrdered(selectedSlotsFull.value.map((slot) => slotCourtName(slot)).filter(Boolean)),
)
const selectionCourtsLabel = computed(() =>
  joinWithAnd(selectionCourtNames.value, locale.value === 'fa' ? 'و' : '&'),
)
const payConfirmCourtsLabel = computed(() => {
  const fromSelection = selectionCourtsLabel.value
  if (fromSelection) return fromSelection
  const id = selectedSlot.value?.courtId || selectionCourtId.value || activeCourtId.value
  const court = courts.value.find((item) => item.id === id)
  return court ? localizedField(court, 'nameFa', 'nameEn') : ''
})
const batchMode = computed(() =>
  selectedSlotIds.value.length > 1
  && showMenu.value
  && selectedSlotsFull.value.length > 0
  && selectedSlotsFull.value.every((slot) => slot.displayStatus === 'FREE'),
)
const bookedSiblingSlots = computed(() => {
  const courtOrder = courts.value.map((court) => court.id)
  const live = bookedSiblingIds.value
    .map((id) => data.value?.slots?.find((slot) => slot.id === id))
    .filter((slot): slot is OwnerCalendarSlot => slot != null && isCancellableBookedSlot(slot))
  return sortSlotsByTimeThenCourt(live, courtOrder)
})
const showBookedCancelChecks = computed(() => bookedSiblingSlots.value.length > 1)
const canBatchReserve = computed(() =>
  selectedSlotsFull.value.length > 0
    && selectedSlotsFull.value.every((slot) => slot.displayStatus === 'FREE'),
)
const canBatchBlock = computed(() =>
  selectedSlotsFull.value.length > 0
    && selectedSlotsFull.value.every((slot) => slot.displayStatus === 'FREE'),
)
const selectionHasUnavailableSlot = computed(() =>
  selectedSlotsFull.value.some((slot) => slot.displayStatus !== 'FREE'),
)

watch(canBatchReserve, (ok) => {
  if (ok) actionError.value = ''
})
const courtPrice = computed(() => {
  if (selectedSlotsFull.value.length) {
    return selectedSlotsFull.value.reduce((sum, slot) => sum + (slot.price ?? 0), 0)
  }
  return selectedSlotFull.value?.price ?? 0
})
const selectedCoach = computed(() => {
  if (!packageForm.coachId) return null
  return clubCoaches.value.find((coach) => coach.id === packageForm.coachId) || null
})
const dayNumber = computed(() => formatDayNumber(currentDate.value))
const weekdayLabel = computed(() => formatWeekday(currentDate.value))
const monthLabel = computed(() => formatMonth(currentDate.value))
const dateNavLabel = computed(() => `${weekdayLabel.value} | ${dayNumber.value} ${monthLabel.value}`)

const dateStripDays = computed(() => {
  const centerOffset = 3
  return Array.from({ length: 7 }, (_, index) => {
    const iso = addDaysToIsoDate(date.value, index - centerOffset)
    const cellDate = new Date(`${iso}T12:00:00`)
    return {
      iso,
      dayNumber: formatDayNumber(cellDate),
      weekday: formatWeekday(cellDate),
      isToday: iso === today(),
    }
  })
})

function closeDatePicker() {
  showDatePicker.value = false
}

function onDocumentClick(event: MouseEvent) {
  if (!showDatePicker.value) return
  const target = event.target as Node | null
  if (target && datePickerRef.value && !datePickerRef.value.contains(target)) {
    closeDatePicker()
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  clearLongPressTimer()
})

function activeBooking(slot: OwnerCalendarSlot | null | undefined) {
  const booking = slot?.booking
  if (!booking || booking.status === 'CANCELLED') return null
  return booking
}

function isReservedDisplayStatus(status: string) {
  return status === 'RESERVED' || status === 'PUBLIC' || status === 'TEAM'
}

function slotPaymentChannel(slot?: OwnerCalendarSlot | null) {
  const booking = activeBooking(slot)
  if (!booking) return null
  return resolvePaymentChannel(
    booking.payment?.method || booking.paymentMethod,
    booking.payment?.status || booking.paymentStatus,
  )
}

function isIpgReservedSlot(slot?: OwnerCalendarSlot | null) {
  return isReservedDisplayStatus(slot?.displayStatus || '') && slotPaymentChannel(slot) === 'IPG'
}

function slotClass(status: string, slot?: OwnerCalendarSlot | null) {
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
    // Unpaid wins over channel so desk unpaid / pending-online never look like settled pink.
    if (isUnpaidPaymentStatus(slotPaymentStatus(slot))) return `${base} slot-reserved-unpaid`
    if (slotPaymentChannel(slot) === 'IPG') return `${base} slot-reserved-ipg`
    return `${base} slot-reserved-cash`
  }
  return base
}

function isPastFreeSlot(slot: OwnerCalendarSlot | null | undefined) {
  return Boolean(slot && slot.displayStatus === 'FREE' && slotIsInPast(slot))
}

function gridCellClasses(courtId: string, hour: string) {
  const slot = cellSlot(courtId, hour)
  if (isExternalOnlyOccupied(slot)) {
    return [
      'slot-blocked',
      slot && isSlotSelected(slot) ? 'canva-cal-grid-cell-selected' : '',
    ]
  }
  return [
    slotClass(slot?.displayStatus || 'FREE', slot),
    slot && isSlotSelected(slot) ? 'canva-cal-grid-cell-selected' : '',
  ]
}

function statusLabel(status: string) {
  return t(`owner.status.${status}`)
}

function cellSlot(courtId: string, hour: string) {
  return data.value?.slots?.find((s) => s.courtId === courtId && s.startTime === hour)
}

function bookingSourceLabel(source?: string | null) {
  if (source === 'PLATFORM') return t('owner.bookingSourcePlatform')
  if (source === 'CLUB') return t('owner.bookingSourceClub')
  return ''
}

function slotGuestLine(slot: OwnerCalendarSlot | null | undefined) {
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

function slotNoteLine(slot: OwnerCalendarSlot | null | undefined) {
  if (!slot || slot.displayStatus === 'FREE') return ''
  return activeBooking(slot)?.comments?.trim() || ''
}

function slotCellTitle(slot: OwnerCalendarSlot | null | undefined) {
  if (!slot) return ''
  if (isExternalOnlyOccupied(slot)) return externalSiteBadge(slot)
  if (slot.displayStatus === 'FREE') {
    return isPastFreeSlot(slot) ? t('owner.slotPast') : ''
  }
  const pay = slotPaymentBadge(slot)
  const source = bookingSourceLabel(activeBooking(slot)?.source)
  return [slotGuestLine(slot), source, pay, slotNoteLine(slot)].filter(Boolean).join(' — ')
}

function slotPaymentStatus(slot: OwnerCalendarSlot | null | undefined) {
  const booking = activeBooking(slot)
  if (!booking) return null
  return booking.payment?.status || booking.paymentStatus || null
}

function slotMeta(slot: OwnerCalendarSlot | null | undefined) {
  if (!slot || slot.displayStatus === 'FREE' || slot.displayStatus === 'BLOCKED')
    return ''

  return activeBooking(slot)?.guestMobile || ''
}

function slotPaymentBadge(slot: OwnerCalendarSlot | null | undefined) {
  const status = slotPaymentStatus(slot)
  if (!status || slot?.displayStatus === 'FREE' || slot?.displayStatus === 'BLOCKED')
    return ''
  // Soft online hold — distinct from desk unpaid «پرداخت‌نشده».
  if (slot?.displayStatus === 'PENDING') return t('owner.status.PENDING')
  // Short grid labels — full status strings clip in narrow court columns.
  if (isUnpaidPaymentStatus(status)) return t('owner.slotPayUnpaid')
  if (isPaidPaymentStatus(status)) return t('owner.slotPayPaid')
  return t(`booking.paymentStatus.${status}`)
}

function slotPaymentBadgeClass(slot: OwnerCalendarSlot | null | undefined) {
  const status = slotPaymentStatus(slot)
  if (!status) return ''
  return isUnpaidPaymentStatus(status) ? 'canva-slot-pay-unpaid' : 'canva-slot-pay-paid'
}

function resetPanels() {
  activePanel.value = null
}

function defaultPanelForSlot(slot: OwnerCalendarSlot): ActivePanel {
  if (isExternalOnlyOccupied(slot)) return 'external'
  if (slot.displayStatus === 'BLOCKED') return 'block'
  if (slot.displayStatus === 'CLOSED') return 'comments'
  if (activeBooking(slot) || (slot.displayStatus !== 'FREE' && slot.displayStatus !== 'BLOCKED')) return 'detail'
  // Free slot: reserve/block open from the selection bar with an explicit panel.
  return null
}

function courtColumnLabel(court: { nameFa: string; nameEn: string }, index: number) {
  const name = localizedField(court, 'nameFa', 'nameEn')
  return name || t('booking.courtNumber', { n: formatNumber(index + 1) })
}

function hasSlotNote(slot: OwnerCalendarSlot | null | undefined) {
  return Boolean(activeBooking(slot)?.comments?.trim())
}

function gridCellBarClass(slot?: OwnerCalendarSlot | null) {
  if (isExternalOnlyOccupied(slot)) return 'canva-cal-grid-cell-bar-blocked'
  const status = slot?.displayStatus || 'FREE'
  if (isReservedDisplayStatus(status)) {
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

function setSelectionReserveError() {
  if (deskReserveSelectionIssue(selectedSlotsFull.value) === 'unavailable') {
    actionError.value = t('booking.errors.slotNotAvailable')
    return
  }
  actionError.value = ''
}

const guestFullName = computed({
  get() {
    return formatGuestDisplayName(form.guestName, form.guestFamily)
  },
  set(value: string) {
    const parts = value.trim().split(/\s+/)
    form.guestName = parts[0] || ''
    form.guestFamily = parts.slice(1).join(' ')
  },
})

type GuestSearchHit = { name: string; mobile: string; source: 'user' | 'contact' | 'booking' }
const guestSuggestions = ref<GuestSearchHit[]>([])
const guestSearchOpen = ref(false)
const guestSearchPending = ref(false)
let guestSearchTimer: ReturnType<typeof setTimeout> | null = null
let guestSearchRequest = 0

function clearGuestSearch() {
  if (guestSearchTimer) {
    clearTimeout(guestSearchTimer)
    guestSearchTimer = null
  }
  guestSuggestions.value = []
  guestSearchOpen.value = false
  guestSearchPending.value = false
}

async function runGuestSearch(raw: string) {
  const q = raw.trim()
  if (q.length < 2) {
    guestSuggestions.value = []
    guestSearchOpen.value = false
    guestSearchPending.value = false
    return
  }
  const requestId = ++guestSearchRequest
  guestSearchPending.value = true
  guestSearchOpen.value = true
  try {
    const res = await $fetch<{ guests: GuestSearchHit[] }>('/api/owner/guests/search', {
      query: { q },
    })
    if (requestId !== guestSearchRequest) return
    guestSuggestions.value = res.guests || []
  } catch {
    if (requestId !== guestSearchRequest) return
    guestSuggestions.value = []
  } finally {
    if (requestId === guestSearchRequest) {
      guestSearchPending.value = false
      guestSearchOpen.value = guestSuggestions.value.length > 0
    }
  }
}

function scheduleGuestSearch(raw: string) {
  if (guestSearchTimer) clearTimeout(guestSearchTimer)
  guestSearchTimer = setTimeout(() => {
    void runGuestSearch(raw)
  }, 250)
}

const guestSearchSource = ref<'name' | 'mobile'>('name')

function onGuestFullNameInput() {
  guestSearchSource.value = 'name'
  scheduleGuestSearch(guestFullName.value)
}

function onGuestMobileInput() {
  guestSearchSource.value = 'mobile'
  scheduleGuestSearch(form.guestMobile)
}

function selectGuestSuggestion(guest: GuestSearchHit) {
  guestFullName.value = guest.name || guestFullName.value
  if (guest.mobile) form.guestMobile = guest.mobile
  clearGuestSearch()
}

function closeGuestSearchSoon() {
  setTimeout(() => {
    guestSearchOpen.value = false
  }, 150)
}

function detailCoachLabel() {
  const booking = activeBooking(selectedSlotFull.value)
  if (!booking?.coachId) return t('owner.sessionTypeFree')
  const coach = clubCoaches.value.find((item) => item.id === booking.coachId)
  if (!coach) return t('owner.sessionTypeCoach')
  return localizedField(coach, 'nameFa', 'nameEn')
}

const menuIconMap: Record<string, { icon: string; wrap: string }> = {
  markPaid: { icon: 'payments', wrap: 'bg-emerald-50 text-emerald-700' },
  markUnpaid: { icon: 'undo', wrap: 'bg-amber-50 text-amber-800' },
  cancel: { icon: 'event_busy', wrap: 'bg-red-50 text-red-600' },
  block: { icon: 'block', wrap: 'bg-brand-gray-100 text-brand-gray-600' },
  reserve: { icon: 'event_available', wrap: 'bg-brand-primary-soft text-brand-primary' },
  season: { icon: 'event_repeat', wrap: 'bg-brand-primary-soft text-brand-primary' },
  package: { icon: 'sports', wrap: 'bg-brand-primary-soft text-brand-primary' },
  comments: { icon: 'chat', wrap: 'bg-brand-lavender text-brand-navy' },
  equipment: { icon: 'inventory_2', wrap: 'bg-brand-lavender text-brand-navy' },
  close: { icon: 'close', wrap: 'bg-brand-gray-100 text-brand-gray-600' },
}

function menuIcon(key: string) {
  return menuIconMap[key]?.icon || 'circle'
}

function menuIconWrap(key: string) {
  return menuIconMap[key]?.wrap || 'bg-brand-gray-100 text-brand-gray-600'
}

function defaultDayRange(fullSlot: { startTime: string; endTime: string }): DayTimeRange {
  return {
    start: fullSlot.startTime.slice(0, 5),
    end: fullSlot.endTime.slice(0, 5),
  }
}

function seasonScheduleValid() {
  return hasValidDayTimes(seasonForm.dayTimes, seasonForm.days)
}

function packageScheduleValid() {
  return hasValidDayTimes(packageForm.dayTimes, packageForm.days)
}

function equipmentPriceForItem(item: { category: string; price: number }) {
  if (item.category === 'CLUB') return 0
  return item.price || 0
}

function equipmentStock(item: { quantity?: number }) {
  return Math.max(0, Number(item.quantity ?? 1))
}

function reserveEquipmentExcludeBookingId() {
  if (isNewReservation()) return undefined
  const slot = selectedSlotFull.value
  return activeBooking(slot)?.id
}

function reserveEquipmentStartTimes() {
  const slots = slotsForReserve()
  return uniqueOrdered(slots.map((slot) => normalizeSlotTime(slot.startTime)).filter(Boolean))
}

/** Available units at selected slot time(s), accounting for other bookings the same hour. */
function equipmentAvailable(item: { id: string; quantity?: number }) {
  const slots = slotsForReserve()
  if (!slots.length) return equipmentStock(item)
  return minAvailableEquipmentAcrossTimes(
    data.value?.slots || [],
    item.id,
    date.value,
    reserveEquipmentStartTimes(),
    equipmentStock(item),
    reserveEquipmentExcludeBookingId(),
  )
}

function sumEquipmentIds(ids: string[], quantities?: Record<string, number>) {
  return (equipments.value || [])
    .filter((item) => ids.includes(item.id))
    .reduce((sum, item) => {
      const qty = Math.max(1, quantities?.[item.id] || 1)
      return sum + equipmentPriceForItem(item) * qty
    }, 0)
}

function equipmentOptionLabel(item: { nameFa: string; nameEn: string; category: string; price: number }) {
  const name = localizedField(item, 'nameFa', 'nameEn')
  if (item.category === 'CLUB' || !item.price) return `${name} (${t('owner.free')})`
  return `${name} — ${formatCurrency(item.price)}`
}

function equipmentQuantitiesPayload(ids: string[] = form.equipmentIds) {
  const out: Record<string, number> = {}
  for (const id of ids) {
    out[id] = Math.max(1, form.equipmentQuantities[id] || 1)
  }
  return out
}

const reserveEquipmentPrice = computed(() => {
  const base = sumEquipmentIds(form.equipmentIds, form.equipmentQuantities)
  if (batchMode.value && activePanel.value === 'reserve') {
    return base * selectedSlotsFull.value.length
  }
  return base
})
const seasonEquipmentPrice = computed(() => sumEquipmentIds(seasonForm.equipmentId ? [seasonForm.equipmentId] : []))
const packageEquipmentPrice = computed(() => sumEquipmentIds(packageForm.equipmentId ? [packageForm.equipmentId] : []))
const seasonDateRangeInvalid = computed(() =>
  Boolean(seasonForm.startDate && seasonForm.finishDate && seasonForm.finishDate < seasonForm.startDate),
)
const seasonStartInPast = computed(() =>
  Boolean(seasonForm.startDate && isPastDate(seasonForm.startDate)),
)
const seasonDatesValid = computed(() =>
  Boolean(seasonForm.startDate && seasonForm.finishDate && !seasonDateRangeInvalid.value && !seasonStartInPast.value),
)
const seasonSessionCount = computed(() => {
  if (!seasonDatesValid.value) return 0
  return countRecurringSessionsByDayInRange(
    seasonForm.dayTimes,
    seasonForm.days,
    seasonForm.startDate,
    seasonForm.finishDate,
  )
})
const packageDateRangeInvalid = computed(() =>
  Boolean(packageForm.startDate && packageForm.finishDate && packageForm.finishDate < packageForm.startDate),
)
const packageStartInPast = computed(() =>
  Boolean(packageForm.startDate && isPastDate(packageForm.startDate)),
)
const packageDatesValid = computed(() =>
  Boolean(packageForm.startDate && packageForm.finishDate && !packageDateRangeInvalid.value && !packageStartInPast.value),
)
const packageSessionCount = computed(() => {
  if (!packageDatesValid.value) return 0
  return countRecurringSessionsByDayInRange(
    packageForm.dayTimes,
    packageForm.days,
    packageForm.startDate,
    packageForm.finishDate,
  )
})
const seasonSessionLabel = computed(() => {
  if (!seasonSessionCount.value || !seasonForm.days.length || !seasonDatesValid.value) return ''
  const dayLabels = seasonForm.days.map((day) => t(`owner.weekdays.${day}`)).join(locale.value === 'fa' ? ' و ' : ' & ')
  return t('owner.seasonPage.sessionCountLabel', {
    count: seasonSessionCount.value,
    start: formatDate(seasonForm.startDate),
    end: formatDate(seasonForm.finishDate),
    days: dayLabels,
    timeRange: t('owner.seasonPage.perDayTimes'),
  })
})
const packageSessionLabel = computed(() => {
  if (!packageSessionCount.value || !packageForm.days.length || !packageDatesValid.value) return ''
  const dayLabels = packageForm.days.map((day) => t(`owner.weekdays.${day}`)).join(locale.value === 'fa' ? ' و ' : ' & ')
  return t('owner.seasonPage.sessionCountLabel', {
    count: packageSessionCount.value,
    start: formatDate(packageForm.startDate),
    end: formatDate(packageForm.finishDate),
    days: dayLabels,
    timeRange: t('owner.seasonPage.perDayTimes'),
  })
})

function clearSelection() {
  selectedSlotIds.value = []
  bookedSiblingIds.value = []
  selectionCourtId.value = null
  actionError.value = ''
}

function isSlotSelected(slot: OwnerCalendarSlot) {
  return selectedSlotIds.value.includes(slot.id)
}

function toggleFreeSlot(slot: OwnerCalendarSlot) {
  if (slot.displayStatus !== 'FREE' || isExternalOnlyOccupied(slot)) return
  if (isSlotSelected(slot)) {
    selectedSlotIds.value = selectedSlotIds.value.filter((id) => id !== slot.id)
    if (!selectedSlotIds.value.length) selectionCourtId.value = null
    return
  }
  selectionCourtId.value = slot.courtId
  selectedSlotIds.value = [...selectedSlotIds.value, slot.id]
}

function toggleBookedSlot(slot: OwnerCalendarSlot) {
  if (!isCancellableBookedSlot(slot)) return
  selectedSlotIds.value = toggleBookedSlotSelection(
    selectedSlotIds.value,
    slot.id,
    bookedSiblingSlots.value.map((item) => item.id),
  )
}

function openBookedSlot(fullSlot: OwnerCalendarSlot) {
  const courtOrder = courts.value.map((court) => court.id)
  const siblings = siblingBookedSlots(data.value?.slots || [], fullSlot, courtOrder)
  if (!siblings.length) {
    clearSelection()
    openSlot(fullSlot)
    return
  }
  bookedSiblingIds.value = siblings.map((item) => item.id)
  selectedSlotIds.value = [...bookedSiblingIds.value]
  selectionCourtId.value = null
  openSlot(fullSlot, { keepSelection: true })
}

function handleSlotClick(slot: OwnerCalendarSlot | null | undefined) {
  if (!slot) return
  if (longPressFired) {
    longPressFired = false
    return
  }
  const fullSlot = (data.value?.slots?.find((s) => s.id === slot.id) || slot) as OwnerCalendarSlot
  if (isExternalOnlyOccupied(fullSlot)) {
    openSlot(fullSlot)
    return
  }
  if (fullSlot.displayStatus !== 'FREE') {
    openBookedSlot(fullSlot)
    return
  }
  // Whole FREE cell toggles multi-select; reserve/block open via the selection bar.
  bookedSiblingIds.value = []
  multiSelectMode.value = true
  toggleFreeSlot(fullSlot)
}

function openSelectionReserve() {
  if (!selectedSlotsFull.value.length) return
  if (!canBatchReserve.value) {
    setSelectionReserveError()
    return
  }
  openSlot(selectedSlotsFull.value[0], { keepSelection: true })
  activePanel.value = 'reserve'
}

function openSelectionBlock() {
  if (!canBatchBlock.value || !selectedSlotsFull.value.length) return
  openSlot(selectedSlotsFull.value[0], { keepSelection: true })
  activePanel.value = 'block'
}

function openSlot(slot: OwnerCalendarSlot | null | undefined, opts?: { keepSelection?: boolean }) {
  if (!slot) return
  const fullSlot = (data.value?.slots?.find((s) => s.id === slot.id) || slot) as OwnerCalendarSlot
  if (!opts?.keepSelection) clearSelection()
  selectedSlot.value = fullSlot
  showMenu.value = true
  resetPanels()
  activePanel.value = defaultPanelForSlot(fullSlot)
  cancelReason.value = 'CUSTOMER_REQUEST'
  refundToWallet.value = true
  actionError.value = ''
  sessionType.value = activeBooking(fullSlot)?.coachId && !pilotNoCoach.value ? 'coach' : 'free'
  const isFree = fullSlot.displayStatus === 'FREE' || !activeBooking(fullSlot)
  const booking = activeBooking(fullSlot)
  form.guestName = isFree ? '' : (booking?.guestName || '')
  form.guestFamily = isFree ? '' : (booking?.guestFamily || '')
  form.guestMobile = isFree ? '' : (booking?.guestMobile || '')
  clearGuestSearch()
  const existingMethod = booking?.payment?.method || booking?.paymentMethod || 'CASH'
  form.paymentMethod = isFree
    ? 'CASH'
    : (existingMethod === 'IPG' && !payAtClubMode.value ? 'IPG' : 'CASH')
  form.paymentStatus = isFree ? 'PAY_AT_CLUB' : (booking?.payment?.status || booking?.paymentStatus || 'PAY_AT_CLUB')
  form.comments = isFree ? '' : (booking?.comments || '')
  form.displayStatus = isFree ? 'RESERVED' : fullSlot.displayStatus
  const equipmentIds = isFree ? [] : (booking?.bookingEquipments?.map((item) => item.equipmentId) || [])
  form.equipmentIds = equipmentIds
  const quantities: Record<string, number> = {}
  if (!isFree) {
    for (const row of booking?.bookingEquipments || []) {
      quantities[row.equipmentId] = Math.max(1, row.quantity || 1)
    }
  }
  form.equipmentQuantities = quantities
  const defaultRange = defaultDayRange(fullSlot)
  const anchorDay = weekdayNameFromDate(fullSlot.date || data.value?.date || today())
  seasonForm.startDate = ''
  seasonForm.finishDate = ''
  seasonForm.days = [anchorDay]
  seasonForm.dayTimes = ensureDayTimesForDays({}, [anchorDay], defaultRange)
  seasonForm.equipmentId = equipmentIds[0] || ''
  seasonForm.comments = booking?.comments || ''
  packageForm.coachId = pilotNoCoach.value ? '' : (booking?.coachId || '')
  packageForm.startDate = ''
  packageForm.finishDate = ''
  packageForm.days = [anchorDay]
  packageForm.dayTimes = ensureDayTimesForDays({}, [anchorDay], defaultRange)
  packageForm.equipmentId = equipmentIds[0] || ''
  packageForm.comments = booking?.comments || ''
}

function openCancelForm() {
  if (!slotsForCancel().length) return
  cancelReason.value = cancelReason.value || 'CUSTOMER_REQUEST'
  refundToWallet.value = true
  activePanel.value = 'cancel'
}

function parseDeskPercent(raw: string) {
  const ascii = String(raw || '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[^\d]/g, '')
  if (!ascii) return 0
  return clampDiscountPercent(Number(ascii))
}

function onDeskPercentInput() {
  if (!deskDiscount.value) return
  deskDiscount.value = null
  deskDiscountInput.value = ''
}

function openPayConfirm() {
  if (!canSubmitReserve()) return
  deskDiscountInput.value = ''
  deskDiscountError.value = ''
  deskDiscount.value = null
  deskPercentInput.value = ''
  deskPayMode.value = 'cash'
  activePanel.value = 'payConfirm'
}

async function confirmDeskPay(mode: 'cash' | 'unpaid' | 'complimentary') {
  deskPayMode.value = mode
  if (mode === 'cash' || mode === 'complimentary') {
    form.paymentMethod = 'CASH'
    form.paymentStatus = 'PAID'
  } else {
    form.paymentMethod = payAtClubMode.value ? 'CASH' : 'IPG'
    form.paymentStatus = 'PAY_AT_CLUB'
  }
  await doReserve()
}

const payLinkWhatsappHref = computed(() => {
  const link = lastPayLink.value
  if (!link) return ''
  return whatsappHrefForIranMobile(link.mobile, t('owner.payLinkWhatsappText', { url: link.url }))
})

async function copyPayLink() {
  const url = lastPayLink.value?.url
  if (!url || !import.meta.client) return
  try {
    await navigator.clipboard.writeText(url)
    payLinkCopied.value = true
  } catch {
    payLinkCopied.value = false
  }
}

function openCommentsForm() {
  actionError.value = ''
  activePanel.value = 'comments'
}

async function doSaveNote() {
  const slot = selectedSlotFull.value
  if (!slot || saving.value) return
  const comments = form.comments.trim()
  if (!comments && !activeBooking(slot)) {
    actionError.value = t('owner.noteRequired')
    return
  }
  saving.value = true
  actionError.value = ''
  try {
    await $fetch('/api/owner/slot-note', {
      method: 'POST',
      body: {
        slotId: slot.id,
        comments,
      },
    })
    await finishSlotAction()
  } catch {
    actionError.value = t('common.error')
  } finally {
    saving.value = false
  }
}

function openSeasonForm() {
  if (!canShowSeasonReserve()) return
  activePanel.value = 'season'
}

function openPackageForm() {
  // Same kill switch as season — package recurring reserve stays frozen.
  if (!canShowSeasonReserve()) return
  activePanel.value = 'package'
}

function openEquipmentForm() {
  activePanel.value = 'equipment'
}

function closeMenu() {
  showMenu.value = false
  resetPanels()
  cancelReason.value = ''
  actionError.value = ''
  lastPayLink.value = null
  payLinkCopied.value = false
  if (!multiSelectMode.value) clearSelection()
}

/** After a successful slot action: drop selection so the bar cannot stick under the sheet. */
async function finishSlotAction() {
  deskPayMode.value = 'cash'
  deskDiscount.value = null
  deskPercentInput.value = ''
  multiSelectMode.value = false
  clearSelection()
  closeMenu()
  await refreshCalendar()
}

/** Partial batch reserve/block can leave mixed cells; refresh then drop leftover FREE chips. */
async function recoverAfterBatchError() {
  await refreshCalendar()
  selectedSlotIds.value = []
  bookedSiblingIds.value = []
  selectionCourtId.value = null
  multiSelectMode.value = false
}

function hasBookedDetailContext() {
  const slot = selectedSlot.value
  if (!slot) return false
  if (activeBooking(slot) || canCancelSlot()) return true
  return slot.displayStatus !== 'FREE' && slot.displayStatus !== 'BLOCKED'
}

function backToMenu() {
  if (hasBookedDetailContext()) {
    activePanel.value = 'detail'
  } else {
    closeMenu()
  }
  actionError.value = ''
}

const slotModalTitle = computed(() => {
  switch (activePanel.value) {
    case 'reserve':
      return reserveMenuLabel()
    case 'block':
      return t('owner.blockFormTitle')
    case 'detail':
      return t('owner.currentBooking')
    case 'external':
      return t('owner.externalBookingTitle')
    case 'cancel':
      return t('owner.cancel')
    case 'comments':
      return t('owner.comments')
    case 'payConfirm':
      return t('owner.deskConfirmTitle')
    case 'payLinkSent':
      return t('owner.payLinkSentTitle')
    case 'season':
      return t('owner.seasonPage.title')
    case 'package':
      return t('owner.packagesPage.title')
    case 'equipment':
      return t('owner.equipments')
    default:
      return t('owner.slotActions')
  }
})

function toggleDay(days: string[], day: string) {
  if (days.includes(day)) {
    return days.filter((item) => item !== day)
  }
  return [...days, day]
}

function toggleSeasonDay(day: string) {
  const nextDays = toggleDay(seasonForm.days, day)
  const fallback = Object.values(seasonForm.dayTimes)[0] || defaultDayRange(selectedSlotFull.value || { startTime: '12:00', endTime: '13:00' })
  seasonForm.days = nextDays
  seasonForm.dayTimes = ensureDayTimesForDays(seasonForm.dayTimes, nextDays, fallback)
}

function togglePackageDay(day: string) {
  const nextDays = toggleDay(packageForm.days, day)
  const fallback = Object.values(packageForm.dayTimes)[0] || defaultDayRange(selectedSlotFull.value || { startTime: '12:00', endTime: '13:00' })
  packageForm.days = nextDays
  packageForm.dayTimes = ensureDayTimesForDays(packageForm.dayTimes, nextDays, fallback)
}

function reserveDisplayStatus() {
  if (!selectedSlot.value) return form.displayStatus || 'RESERVED'
  if (selectedSlot.value.displayStatus === 'FREE') return 'RESERVED'
  return form.displayStatus || selectedSlot.value.displayStatus
}

function isEditingBooking() {
  return Boolean(activeBooking(selectedSlot.value)) && !batchMode.value
}

const editableSlotStatuses = ['RESERVED', 'PUBLIC', 'TEAM', 'PENDING'] as const
/** Desk status picker — court MVP: no coach-ish TEAM/PUBLIC session types when pilotNoCoach. */
const deskSlotStatuses = computed(() => {
  if (pilotNoCoach.value) return ['RESERVED', 'PENDING'] as const
  return editableSlotStatuses
})

watch(deskSlotStatuses, (allowed) => {
  if (!(allowed as readonly string[]).includes(form.displayStatus)) {
    form.displayStatus = 'RESERVED'
  }
})

function slotsForReserve() {
  if (selectedSlotsFull.value.length) return selectedSlotsFull.value
  if (selectedSlotFull.value) return [selectedSlotFull.value]
  return []
}

function slotsForCancel() {
  if (showBookedCancelChecks.value || bookedSiblingSlots.value.length) {
    return checkedBookedSlots(bookedSiblingSlots.value, selectedSlotIds.value)
  }
  const slot = selectedSlotFull.value
  if (
    slot
    && activeBooking(slot)
    && slot.displayStatus !== 'FREE'
    && slot.displayStatus !== 'BLOCKED'
    && slot.displayStatus !== 'CLOSED'
  ) {
    return [slot]
  }
  return []
}

function slotsForMarkPaid() {
  if (showBookedCancelChecks.value || bookedSiblingSlots.value.length) {
    return checkedUnpaidBookedSlots(bookedSiblingSlots.value, selectedSlotIds.value)
  }
  const slot = selectedSlotFull.value
  if (slot && canMarkPaidSlot(slot)) return [slot]
  return []
}

function slotsForMarkUnpaid() {
  if (showBookedCancelChecks.value || bookedSiblingSlots.value.length) {
    return checkedDeskReversiblePaidSlots(bookedSiblingSlots.value, selectedSlotIds.value)
  }
  const slot = selectedSlotFull.value
  if (slot && canMarkUnpaidSlot(slot)) return [slot]
  return []
}

function canMarkPaidSlot(slot: OwnerCalendarSlot | null | undefined) {
  if (!slot || slot.displayStatus === 'BLOCKED' || !activeBooking(slot)) return false
  return isUnpaidPaymentStatus(slotPaymentStatus(slot))
}

function canMarkUnpaidSlot(slot: OwnerCalendarSlot | null | undefined) {
  const booking = activeBooking(slot)
  if (!slot || !booking || slot.displayStatus === 'BLOCKED') return false
  if (!isPaidPaymentStatus(slotPaymentStatus(slot))) return false
  const method = booking.payment?.method || booking.paymentMethod
  return method !== 'IPG'
}

function slotsForBlock() {
  if (selectedSlotsFull.value.length) return selectedSlotsFull.value
  if (selectedSlotFull.value) return [selectedSlotFull.value]
  return []
}

function guestNamePayload() {
  return normalizeGuestNamePair(form.guestName, form.guestFamily)
}

async function doReserve() {
  const targets = slotsForReserve()
  if (!targets.length || saving.value || !canSubmitReserve()) return
  saving.value = true
  actionError.value = ''
  try {
    const guest = guestNamePayload()
    const groups = new Map<string, typeof targets>()
    for (const slot of targets) {
      const key = `${slot.date || ''}|${slot.courtId}`
      const list = groups.get(key) || []
      list.push(slot)
      groups.set(key, list)
    }
    let payLink: { payUrl?: string; payPin?: string } = {}
    for (const group of groups.values()) {
      const range = bookingTimeRange(group)
      for (let i = 0; i < group.length; i++) {
        const slot = group[i]!
        const isLast = i === group.length - 1
        const result = await $fetch<{ payUrl?: string; payPin?: string }>('/api/owner/reserve', {
          method: 'POST',
          body: {
            slotId: slot.id,
            guestName: guest.guestName,
            guestFamily: guest.guestFamily,
            guestMobile: form.guestMobile,
            paymentMethod: form.paymentMethod,
            paymentStatus: form.paymentStatus,
            comments: form.comments,
            equipmentIds: form.equipmentIds,
            equipmentQuantities: equipmentQuantitiesPayload(),
            discountCode: activePanel.value === 'payConfirm' ? deskDiscount.value?.code : undefined,
            deskDiscountPercent: activePanel.value === 'payConfirm' && !deskDiscount.value
              ? (parseDeskPercent(deskPercentInput.value) || undefined)
              : undefined,
            complimentary: activePanel.value === 'payConfirm' && deskPayMode.value === 'complimentary',
            displayStatus: slot.displayStatus === 'FREE' ? 'RESERVED' : reserveDisplayStatus(),
            skipNotify: !isLast,
            notifyStartTime: range.startTime,
            notifyEndTime: range.endTime,
          },
        })
        if (result.payUrl && result.payPin) {
          payLink = { payUrl: result.payUrl, payPin: result.payPin }
        }
      }
    }
    if (deskPayMode.value === 'unpaid' && payLink.payUrl && payLink.payPin) {
      lastPayLink.value = {
        url: payLink.payUrl,
        pin: payLink.payPin,
        mobile: form.guestMobile,
      }
      payLinkCopied.value = false
      multiSelectMode.value = false
      clearSelection()
      await refreshCalendar()
      showMenu.value = true
      activePanel.value = 'payLinkSent'
    } else {
      await finishSlotAction()
    }
  } catch (err) {
    actionError.value = fetchErrorMessage(err, t('common.error'))
    await refreshCalendar()
  } finally {
    saving.value = false
  }
}

function pruneBookedCancelSelection() {
  const liveIds = new Set(bookedSiblingSlots.value.map((slot) => slot.id))
  selectedSlotIds.value = selectedSlotIds.value.filter((id) => liveIds.has(id))
  bookedSiblingIds.value = bookedSiblingIds.value.filter((id) => liveIds.has(id))
  const next = bookedSiblingSlots.value.find((slot) => selectedSlotIds.value.includes(slot.id))
    || bookedSiblingSlots.value[0]
  if (next) selectedSlot.value = next
}

async function doCancel() {
  const targets = slotsForCancel().filter((slot) => {
    if (slot.displayStatus === 'FREE' || slot.displayStatus === 'BLOCKED' || slot.displayStatus === 'CLOSED') return false
    return Boolean(activeBooking(slot))
  })
  if (!targets.length || !cancelReason.value || saving.value) return
  saving.value = true
  actionError.value = ''
  try {
    const range = bookingTimeRange(targets)
    for (let i = 0; i < targets.length; i++) {
      const slot = targets[i]!
      const isLast = i === targets.length - 1
      await $fetch('/api/owner/cancel', {
        method: 'POST',
        body: {
          slotId: slot.id,
          reason: cancelReason.value,
          refundToWallet: refundToWallet.value,
          skipNotify: !isLast,
          notifyStartTime: range.startTime,
          notifyEndTime: range.endTime,
        },
      })
    }
    await finishSlotAction()
  } catch (err) {
    actionError.value = fetchErrorMessage(err, t('common.error'))
    await refreshCalendar()
    pruneBookedCancelSelection()
  } finally {
    saving.value = false
  }
}

function deskCashPaymentBody(
  slot: OwnerCalendarSlot,
  paymentStatus: 'PAID' | 'PAY_AT_CLUB',
  opts?: { skipNotify?: boolean; notifyStartTime?: string; notifyEndTime?: string },
) {
  const booking = activeBooking(slot)
  const guest = normalizeGuestNamePair(
    booking?.guestName || form.guestName,
    booking?.guestFamily || form.guestFamily,
  )
  return {
    slotId: slot.id,
    guestName: guest.guestName,
    guestFamily: guest.guestFamily,
    guestMobile: booking?.guestMobile || form.guestMobile,
    paymentMethod: 'CASH' as const,
    paymentStatus,
    comments: booking?.comments || form.comments,
    equipmentIds: (booking?.bookingEquipments || []).map((item) => item.equipmentId),
    equipmentQuantities: Object.fromEntries(
      (booking?.bookingEquipments || []).map((item) => [item.equipmentId, Math.max(1, item.quantity || 1)]),
    ),
    displayStatus: slot.displayStatus === 'FREE' ? 'RESERVED' : slot.displayStatus,
    skipNotify: opts?.skipNotify,
    notifyStartTime: opts?.notifyStartTime,
    notifyEndTime: opts?.notifyEndTime,
  }
}

/** Refresh calendar data but keep the session sheet open so paid/unpaid status is visible. */
async function refreshDeskPaymentSheet(paymentStatus: 'PAID' | 'PAY_AT_CLUB') {
  form.paymentMethod = 'CASH'
  form.paymentStatus = paymentStatus
  actionError.value = ''
  await refreshCalendar()
  const anchorId = selectedSlot.value?.id
  if (anchorId) {
    const refreshed = data.value?.slots?.find((slot) => slot.id === anchorId)
    if (refreshed) selectedSlot.value = refreshed
  }
  // Keep sibling checkboxes in sync with live bookings after payment flips.
  if (bookedSiblingIds.value.length) {
    const liveIds = new Set(bookedSiblingSlots.value.map((slot) => slot.id))
    bookedSiblingIds.value = bookedSiblingIds.value.filter((id) => liveIds.has(id))
    selectedSlotIds.value = selectedSlotIds.value.filter((id) => liveIds.has(id))
    if (!selectedSlotIds.value.length && bookedSiblingIds.value.length) {
      selectedSlotIds.value = [...bookedSiblingIds.value]
    }
  }
  showMenu.value = true
  activePanel.value = 'detail'
}

/** One-click cash collection for unpaid (including online-pending) desk ops. */
async function doMarkPaid() {
  if (saving.value) return
  const targets = slotsForMarkPaid()
  if (!targets.length || !canMarkPaid()) {
    actionError.value = t('owner.deskPaymentNoSlots')
    return
  }
  saving.value = true
  actionError.value = ''
  try {
    const range = bookingTimeRange(targets)
    for (let i = 0; i < targets.length; i++) {
      const slot = targets[i]!
      const isLast = i === targets.length - 1
      await $fetch('/api/owner/reserve', {
        method: 'POST',
        body: deskCashPaymentBody(slot, 'PAID', {
          skipNotify: !isLast,
          notifyStartTime: range.startTime,
          notifyEndTime: range.endTime,
        }),
      })
    }
    await refreshDeskPaymentSheet('PAID')
  } catch (err) {
    actionError.value = fetchErrorMessage(err, t('common.error'))
    await refreshCalendar()
  } finally {
    saving.value = false
  }
}

/** Reverse a mistaken cash mark (or wallet-paid mark) back to unpaid. */
async function doMarkUnpaid() {
  if (saving.value) return
  const targets = slotsForMarkUnpaid()
  if (!targets.length || !canMarkUnpaid()) {
    actionError.value = t('owner.deskPaymentNoSlots')
    return
  }
  saving.value = true
  actionError.value = ''
  try {
    const range = bookingTimeRange(targets)
    for (let i = 0; i < targets.length; i++) {
      const slot = targets[i]!
      const isLast = i === targets.length - 1
      await $fetch('/api/owner/reserve', {
        method: 'POST',
        body: deskCashPaymentBody(slot, 'PAY_AT_CLUB', {
          skipNotify: !isLast,
          notifyStartTime: range.startTime,
          notifyEndTime: range.endTime,
        }),
      })
    }
    await refreshDeskPaymentSheet('PAY_AT_CLUB')
  } catch (err) {
    actionError.value = fetchErrorMessage(err, t('common.error'))
    await refreshCalendar()
  } finally {
    saving.value = false
  }
}

async function doBlock() {
  const targets = slotsForBlock()
  if (!targets.length || saving.value) return
  saving.value = true
  actionError.value = ''
  try {
    const slotIds = targets.map((slot) => slot.id)
    const guest = guestNamePayload()
    await $fetch('/api/owner/block', {
      method: 'POST',
      body: {
        slotIds,
        guestName: guest.guestName,
        guestFamily: guest.guestFamily,
        guestMobile: form.guestMobile,
        comments: form.comments,
      },
    })
    await finishSlotAction()
  } catch {
    actionError.value = t('common.error')
    await recoverAfterBatchError()
  } finally {
    saving.value = false
  }
}

async function doUnblock() {
  const targets = slotsForBlock()
  if (!targets.length || saving.value) return
  saving.value = true
  actionError.value = ''
  try {
    await $fetch('/api/owner/unblock', {
      method: 'POST',
      body: { slotIds: targets.map((slot) => slot.id) },
    })
    await finishSlotAction()
  } catch {
    actionError.value = t('common.error')
  } finally {
    saving.value = false
  }
}

async function doSeasonReserve() {
  if (!canShowSeasonReserve()) return
  if (!selectedSlot.value || saving.value || !seasonForm.days.length || !seasonScheduleValid() || !seasonDatesValid.value || !guestFieldsValid()) return
  saving.value = true
  actionError.value = ''
  try {
    const guest = guestNamePayload()
    await $fetch('/api/owner/season', {
      method: 'POST',
      body: {
        guestName: guest.guestName,
        guestFamily: guest.guestFamily,
        guestMobile: form.guestMobile,
        startDate: seasonForm.startDate,
        finishDate: seasonForm.finishDate,
        days: seasonForm.days,
        dayTimes: seasonForm.dayTimes,
        comments: seasonForm.comments,
        slotId: selectedSlot.value.id,
        equipmentId: seasonForm.equipmentId || undefined,
        paymentMethod: form.paymentMethod,
        paymentStatus: form.paymentStatus,
      },
    })
    await finishSlotAction()
  } catch {
    actionError.value = t('common.error')
  } finally {
    saving.value = false
  }
}

async function doPackageReserve() {
  if (!canShowSeasonReserve()) return
  if (!selectedSlot.value || saving.value || !packageForm.days.length || !packageScheduleValid() || !packageDatesValid.value || !guestFieldsValid()) return
  saving.value = true
  actionError.value = ''
  try {
    const guest = guestNamePayload()
    await $fetch('/api/owner/package-reserve', {
      method: 'POST',
      body: {
        guestName: guest.guestName,
        guestFamily: guest.guestFamily,
        guestMobile: form.guestMobile,
        coachId: pilotNoCoach.value ? undefined : (packageForm.coachId || undefined),
        startDate: packageForm.startDate,
        finishDate: packageForm.finishDate,
        days: packageForm.days,
        dayTimes: packageForm.dayTimes,
        comments: packageForm.comments,
        slotId: selectedSlot.value.id,
        equipmentId: packageForm.equipmentId || undefined,
        paymentMethod: form.paymentMethod,
        paymentStatus: form.paymentStatus,
      },
    })
    await finishSlotAction()
  } catch {
    actionError.value = t('common.error')
  } finally {
    saving.value = false
  }
}

async function saveEquipmentSelection() {
  if (!selectedSlot.value || saving.value) return
  saving.value = true
  actionError.value = ''
  try {
    const guest = guestNamePayload()
    await $fetch('/api/owner/reserve', {
      method: 'POST',
      body: {
        slotId: selectedSlot.value.id,
        guestName: guest.guestName,
        guestFamily: guest.guestFamily,
        guestMobile: form.guestMobile,
        paymentMethod: form.paymentMethod,
        paymentStatus: form.paymentStatus,
        comments: form.comments,
        equipmentIds: form.equipmentIds,
        equipmentQuantities: equipmentQuantitiesPayload(),
        displayStatus: reserveDisplayStatus(),
      },
    })
    await finishSlotAction()
  } catch {
    actionError.value = t('common.error')
  } finally {
    saving.value = false
  }
}

function reserveMenuLabel() {
  return isEditingBooking() ? t('owner.editBookingTitle') : t('owner.walkInReserve')
}

function canCancelSlot() {
  if (bookedSiblingSlots.value.length) return true
  return Boolean(activeBooking(selectedSlot.value)) && selectedSlot.value?.displayStatus !== 'BLOCKED'
}

function canBlockSlot() {
  if (batchMode.value) return canBatchBlock.value
  return selectedSlot.value?.displayStatus === 'FREE' || selectedSlot.value?.displayStatus === 'BLOCKED'
}

function canUnblockSlot() {
  return selectedSlot.value?.displayStatus === 'BLOCKED'
}

function canReserveSlot() {
  return selectedSlot.value?.displayStatus !== 'CLOSED' && selectedSlot.value?.displayStatus !== 'BLOCKED'
}

/** Court-booking MVP: season/package recurring reserve hidden (API also rejects). */
function canShowSeasonReserve() {
  return isRecurringReserveEnabled()
}

function canMarkPaid() {
  if (batchMode.value) return false
  return slotsForMarkPaid().length > 0
}

function canMarkUnpaid() {
  if (batchMode.value) return false
  return slotsForMarkUnpaid().length > 0
}

function canShowCoachReserve() {
  return false
}

function slotStatusSummary() {
  const slot = selectedSlotFull.value || selectedSlot.value
  if (!slot) return ''
  const parts: string[] = []
  const pay = slotPaymentStatus(slot)
  if (pay) parts.push(t(`booking.paymentStatus.${pay}`))
  const mobile = activeBooking(slot)?.guestMobile
  if (mobile) parts.push(mobile)
  return parts.join(' · ')
}

function slotGuestName(slot: OwnerCalendarSlot | null | undefined = selectedSlot.value) {
  const booking = activeBooking(slot)
    || activeBooking(selectedSlotFull.value)
    || activeBooking(bookedSiblingSlots.value[0])
  if (booking) return formatGuestDisplayName(booking.guestName, booking.guestFamily)
  return formatGuestDisplayName(form.guestName, form.guestFamily)
}

function slotRowGuestName(slot: OwnerCalendarSlot) {
  const booking = activeBooking(slot)
  if (booking) return formatGuestDisplayName(booking.guestName, booking.guestFamily)
  return slotGuestName(slot)
}

const cancelReasons = ['CUSTOMER_REQUEST', 'NO_PAYMENT', 'SCHEDULE_CONFLICT'] as const

const rentalEquipments = computed(() =>
  (equipments.value || []).filter((item) =>
    item.category === 'CLUB' || item.category === 'RENTAL' || item.category === 'SELL',
  ),
)

const equipmentPickerOptions = computed(() =>
  rentalEquipments.value.map((item) => ({
    id: item.id,
    label: equipmentOptionLabel(item),
  })),
)

function slotButtonClass(slot: OwnerCalendarSlot) {
  const classes = [slotClass(slot.displayStatus, slot), 'slot', 'calendar-slot-card', 'w-full', 'text-start']
  if (isSlotSelected(slot)) classes.push('slot-selected')
  return classes
}

function isNewReservation() {
  if (batchMode.value) return true
  return !activeBooking(selectedSlot.value) || selectedSlot.value?.displayStatus === 'FREE'
}

function guestFieldsValid() {
  // Canva single full-name field → family may be empty for one-word names.
  return Boolean(form.guestName.trim() && form.guestMobile.trim())
}

function toggleReserveEquipment(id: string) {
  if (form.equipmentIds.includes(id)) {
    form.equipmentIds = form.equipmentIds.filter((item) => item !== id)
    const next = { ...form.equipmentQuantities }
    delete next[id]
    form.equipmentQuantities = next
    return
  }
  const stockItem = (equipments.value || []).find((item) => item.id === id)
  if (equipmentAvailable(stockItem || { id }) < 1) return
  form.equipmentIds = [...form.equipmentIds, id]
  form.equipmentQuantities = { ...form.equipmentQuantities, [id]: 1 }
}

function equipmentQty(id: string) {
  if (!form.equipmentIds.includes(id)) return 0
  return Math.max(1, form.equipmentQuantities[id] || 1)
}

function setEquipmentQty(id: string, qty: number) {
  const stockItem = (equipments.value || []).find((item) => item.id === id)
  const stock = equipmentAvailable(stockItem || { id })
  const next = Math.min(stock, Math.max(0, Math.round(qty)))
  if (next <= 0) {
    form.equipmentIds = form.equipmentIds.filter((item) => item !== id)
    const quantities = { ...form.equipmentQuantities }
    delete quantities[id]
    form.equipmentQuantities = quantities
    return
  }
  if (!form.equipmentIds.includes(id)) {
    form.equipmentIds = [...form.equipmentIds, id]
  }
  form.equipmentQuantities = { ...form.equipmentQuantities, [id]: next }
}

function onEquipmentPickerUpdate(ids: string[]) {
  const previous = new Set(form.equipmentIds)
  const nextIds = [...ids]
  const quantities = { ...form.equipmentQuantities }
  for (const id of nextIds) {
    if (!previous.has(id)) {
      const stockItem = (equipments.value || []).find((item) => item.id === id)
      if (equipmentAvailable(stockItem || { id }) < 1) continue
      quantities[id] = 1
    }
  }
  for (const id of previous) {
    if (!nextIds.includes(id)) delete quantities[id]
  }
  form.equipmentIds = nextIds.filter((id) => {
    const stockItem = (equipments.value || []).find((item) => item.id === id)
    return equipmentAvailable(stockItem || { id }) >= 1
  })
  form.equipmentQuantities = quantities
}

function clampReserveEquipmentToAvailability() {
  for (const id of [...form.equipmentIds]) {
    const item = (equipments.value || []).find((row) => row.id === id)
    if (!item) continue
    const max = equipmentAvailable(item)
    if (max < 1) {
      form.equipmentIds = form.equipmentIds.filter((rowId) => rowId !== id)
      const next = { ...form.equipmentQuantities }
      delete next[id]
      form.equipmentQuantities = next
    }
    else if (equipmentQty(id) > max) {
      setEquipmentQty(id, max)
    }
  }
}

watch(
  () => [
    date.value,
    selectedSlotIds.value.join(','),
    selectedSlot.value?.id,
    data.value?.slots?.map((slot) => `${slot.id}:${slot.booking?.id || ''}`).join('|'),
  ],
  () => {
    if (!form.equipmentIds.length) return
    clampReserveEquipmentToAvailability()
  },
)

const payConfirmDateHeading = computed(() => {
  const j = isoToJalaali(date.value)
  return `${weekdayLabel.value} ${formatNumber(j.jd)} ${PERSIAN_MONTHS[j.jm - 1]}`
})

const payConfirmCostLines = computed(() => {
  const lines: Array<{ label: string; amount: number }> = []
  for (const slot of slotsForReserve()) {
    lines.push({
      label: slotCourtName(slot)
        ? t('booking.confirmLineSlotCourt', {
          court: slotCourtName(slot),
          time: formatTimeLabel(slot.startTime || ''),
        })
        : t('booking.confirmLineSlot', {
          date: payConfirmDateHeading.value,
          time: formatTimeLabel(slot.startTime || ''),
        }),
      amount: slot.price ?? 0,
    })
  }
  for (const item of rentalEquipments.value) {
    if (!form.equipmentIds.includes(item.id)) continue
    if (item.category === 'CLUB' || !item.price) continue
    const qty = equipmentQty(item.id)
    lines.push({
      label: t('booking.confirmLineEquipment', {
        name: localizedField(item, 'nameFa', 'nameEn'),
        qty: formatNumber(qty),
      }),
      amount: item.price * qty,
    })
  }
  return lines
})

const payConfirmSubtotal = computed(() =>
  payConfirmCostLines.value.reduce((sum, line) => sum + line.amount, 0),
)
const payConfirmCharge = computed(() => resolveDeskCharge({
  subtotal: payConfirmSubtotal.value,
  percent: deskDiscount.value?.percent ?? parseDeskPercent(deskPercentInput.value),
}))
const payConfirmDiscountAmount = computed(() => payConfirmCharge.value.discountAmount)
const payConfirmTotal = computed(() => payConfirmCharge.value.amount)
const payConfirmDiscountLabel = computed(() => {
  if (deskDiscount.value) {
    return t('booking.confirmLineDiscount', {
      code: deskDiscount.value.code,
      percent: formatNumber(deskDiscount.value.percent),
    })
  }
  const percent = parseDeskPercent(deskPercentInput.value)
  if (percent > 0) return t('owner.deskPercentLine', { percent: formatNumber(percent) })
  return t('booking.discountCode')
})

async function applyDeskDiscount() {
  deskDiscountError.value = ''
  const clubId = selectedClubId.value
    || user.value?.memberships?.[0]?.club?.id
  if (!clubId || !deskDiscountInput.value.trim()) return
  deskDiscountApplying.value = true
  try {
    const result = await $fetch<{ code: string; percent: number; discountAmount: number }>('/api/discounts/validate', {
      method: 'POST',
      body: {
        code: deskDiscountInput.value,
        clubId,
        subtotal: payConfirmSubtotal.value,
      },
    })
    deskDiscount.value = {
      code: result.code,
      percent: result.percent,
      discountAmount: result.discountAmount,
    }
    deskPercentInput.value = String(result.percent)
  } catch {
    deskDiscount.value = null
    deskDiscountError.value = t('booking.discountApplyFailed')
  } finally {
    deskDiscountApplying.value = false
  }
}

function clearDeskDiscount() {
  deskDiscount.value = null
  deskDiscountError.value = ''
  deskPercentInput.value = ''
}

function slotIsInPast(slot: OwnerCalendarSlot) {
  const slotDate = slot.date || date.value
  return isSlotStartInPast(slotDate, slot.startTime)
}

function canSubmitReserve() {
  if (saving.value) return false
  if (!guestFieldsValid()) return false
  return true
}

function reserveFormTitle() {
  return isEditingBooking() ? t('owner.editBookingTitle') : t('owner.reserveFormTitle')
}

function confirmReserveLabel() {
  return isNewReservation() ? t('owner.confirmReserve') : t('common.save')
}

const legend = [
  { status: 'FREE', color: palette.calendarGrid.FREE },
  { status: 'RESERVED_PAID', color: palette.calendarGrid.RESERVED_PAID },
  { status: 'RESERVED_UNPAID', color: palette.calendarGrid.RESERVED_UNPAID },
  { status: 'RESERVED_IPG', color: palette.calendarGrid.RESERVED_IPG },
  { status: 'PENDING', color: palette.calendarGrid.PENDING },
  { status: 'BLOCKED', color: palette.calendarGrid.BLOCKED },
]
</script>

<template>
  <div class="venus-page-stack owner-cal-page" :class="{ 'calendar-page-has-selection': selectedSlotIds.length && !showMenu }">
    <section class="canva-photo-hero -mx-4 min-[431px]:mx-0">
      <img
        :src="clubHeroImage"
        alt=""
        class="canva-photo-hero-media"
        style="filter: grayscale(0.55) brightness(0.72);"
      />
      <div class="canva-photo-hero-wash" />
      <CanvaOwnerHeroChrome />
      <div
        class="canva-promo-badge canva-promo-badge-hero min-[431px]:hidden"
        :aria-label="t('owner.calendarPromo')"
      >
        <span class="canva-promo-badge-pct">۲۰٪</span>
        <span class="canva-promo-badge-label">{{ t('owner.calendarPromoShort') }}</span>
      </div>
      <div class="canva-photo-hero-body !min-h-[9.5rem] !pb-8 min-[431px]:!min-h-[3.25rem] min-[431px]:!pb-3 min-[431px]:!pt-3" />
    </section>

    <div class="canva-cal-sheet -mx-4 min-[431px]:mx-0">
      <h1 class="text-start text-base font-bold text-brand-navy min-[431px]:text-xl min-[431px]:leading-snug">{{ clubCalendarTitle }}</h1>
      <label
        v-if="showClubSwitcher"
        class="canva-cal-club-switch"
      >
        <span class="sr-only">{{ t('owner.activeClub') }}</span>
        <select v-model="selectedClubId" class="canva-cal-club-select">
          <option v-for="item in ownerMemberships" :key="item.club.id" :value="item.club.id">
            {{ localizedField(item.club, 'nameFa', 'nameEn') }}
          </option>
        </select>
      </label>
      <div class="canva-view-tabs mt-3">
        <button
          type="button"
          class="canva-view-tab"
          :class="calendarView === 'today' ? 'canva-view-tab-active canva-cal-tab-active' : ''"
          @click="calendarView = 'today'"
        >
          {{ t('owner.today') }}
        </button>
        <button
          type="button"
          class="canva-view-tab"
          :class="calendarView === 'overview' ? 'canva-view-tab-active canva-cal-tab-active' : ''"
          @click="calendarView = 'overview'"
        >
          {{ t('owner.overview') }}
        </button>
      </div>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="calendar">
    <section v-if="calendarView === 'overview'" class="canva-overview-layout space-y-3">
      <div class="grid grid-cols-3 gap-2 min-[431px]:gap-4">
        <div class="canva-overview-kpi">
          <p class="text-[11px] font-bold text-brand-gray-600">{{ t('owner.overviewBookingsToday') }}</p>
          <p class="mt-1 text-2xl font-bold tabular-nums text-brand-primary">{{ formatNumber(overviewStats.bookingsToday) }}</p>
        </div>
        <div class="canva-overview-kpi">
          <p class="text-[11px] font-bold text-brand-gray-600">{{ t('owner.overviewReservedPct') }}</p>
          <p class="mt-1 text-2xl font-bold tabular-nums text-brand-primary">٪{{ formatNumber(overviewStats.reservedPct) }}</p>
        </div>
        <div class="canva-overview-kpi">
          <p class="text-[11px] font-bold text-brand-gray-600">{{ t('owner.overviewFreeSlots') }}</p>
          <p class="mt-1 text-2xl font-bold tabular-nums text-brand-primary">{{ formatNumber(overviewStats.free) }}</p>
        </div>
      </div>

      <div class="space-y-3">
        <h2 class="text-start text-sm font-bold text-brand-navy">• {{ t('owner.overviewPerCourt') }}</h2>
        <CanvaEmptyState v-if="!overviewStats.perCourt.length" :title="t('owner.emptyCourtsTitle')" doodle="bench" />
        <div v-for="court in overviewStats.perCourt" :key="court.id" class="space-y-1.5">
          <div class="flex items-center justify-between gap-2 text-xs font-bold">
            <span class="text-start text-brand-navy">{{ court.name }}</span>
            <span class="tabular-nums text-brand-gray-500">٪ {{ formatNumber(court.pct) }}</span>
          </div>
          <div class="canva-overview-bar">
            <div class="canva-overview-bar-fill" :style="{ width: `${court.pct}%` }" />
          </div>
        </div>
      </div>
    </section>

    <section v-else class="space-y-3" :class="String(locale) === 'en' ? 'calendar-latin' : ''">
      <!-- Canva closed Today (9): legend · centered date + left FABs · multi-court GRID -->
      <div class="canva-legend-row">
        <div v-for="item in legend" :key="item.status" class="canva-legend-item">
          <span
            class="canva-legend-swatch"
            :class="item.status === 'FREE' ? 'canva-legend-swatch-free' : ''"
            :style="item.status === 'FREE' ? undefined : { background: item.color }"
          />
          {{ statusLabel(item.status) }}
        </div>
        <span class="canva-cal-legend-note">
          <span aria-hidden="true">★</span>
          {{ t('owner.legendNote') }}
        </span>
      </div>

      <div class="canva-cal-grid-shell">
        <div class="canva-cal-date-nav">
          <div class="canva-cal-date-nav-center">
            <button type="button" class="canva-cal-date-nav-btn" :aria-label="t('calendar.prevMonth')" @click="shiftDate(-1)">
              <AppIcon name="chevron_right" size="sm" />
            </button>
            <button
              type="button"
              class="canva-cal-date-nav-label"
              :aria-label="t('owner.pickDate')"
              @click="showDatePicker = true"
            >
              {{ dateNavLabel }}
            </button>
            <button type="button" class="canva-cal-date-nav-btn" :aria-label="t('calendar.nextMonth')" @click="shiftDate(1)">
              <AppIcon name="chevron_left" size="sm" />
            </button>
          </div>
        </div>

        <div class="canva-cal-body">
          <div v-if="!courts.length">
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
                <button
                  v-for="court in courts"
                  :key="`${court.id}-${hour}`"
                  type="button"
                  class="canva-cal-grid-cell"
                  :class="gridCellClasses(court.id, hour)"
                  :title="slotCellTitle(cellSlot(court.id, hour))"
                  :aria-pressed="cellSlot(court.id, hour)?.displayStatus === 'FREE' && !isExternalOnlyOccupied(cellSlot(court.id, hour)) ? isSlotSelected(cellSlot(court.id, hour)!) : undefined"
                  :disabled="!cellSlot(court.id, hour)"
                  @pointerdown="cellSlot(court.id, hour) && onSlotPointerDown(cellSlot(court.id, hour)!)"
                  @pointerup="onSlotPointerEnd"
                  @pointerleave="onSlotPointerEnd"
                  @pointercancel="onSlotPointerEnd"
                  @contextmenu.prevent
                  @click="handleSlotClick(cellSlot(court.id, hour))"
                >
                  <span
                    v-if="cellSlot(court.id, hour) && (cellSlot(court.id, hour)!.displayStatus !== 'FREE' || isExternalOnlyOccupied(cellSlot(court.id, hour)))"
                    class="canva-cal-grid-cell-bar"
                    :class="gridCellBarClass(cellSlot(court.id, hour))"
                  />
                  <span v-if="hasSlotNote(cellSlot(court.id, hour))" class="canva-cal-grid-note" aria-hidden="true">★</span>
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
                  <span
                    v-if="cellSlot(court.id, hour)?.displayStatus === 'FREE' && !isExternalOnlyOccupied(cellSlot(court.id, hour))"
                    class="canva-cal-grid-check"
                    :class="isSlotSelected(cellSlot(court.id, hour)!) ? 'canva-cal-grid-check-on' : ''"
                    aria-hidden="true"
                  />
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <div
        v-if="calendarView === 'today' && selectedSlotIds.length && !showMenu"
        class="canva-selection-bar"
        role="region"
        :aria-label="t('owner.selectionBar.title')"
      >
        <div class="canva-selection-bar-inner">
          <div class="min-w-0 flex-1">
            <p class="text-xs font-bold text-brand-gray-600">{{ t('owner.selectionBar.title') }}</p>
            <p v-if="selectionCourtsLabel" class="mt-0.5 truncate text-start text-sm font-bold text-brand-navy">
              {{ selectionCourtsLabel }} · {{ formattedDate }}
            </p>
            <div class="canva-selection-bar-chips">
              <span
                v-for="slot in selectedSlotsFull"
                :key="slot.id"
                class="canva-selection-bar-chip"
              >
                {{ slotCourtName(slot) }}
                <bdi dir="ltr" class="tabular-nums">{{ formatTimeLabel(slot.startTime) }}</bdi>
              </span>
            </div>
            <div
              v-if="selectionHasUnavailableSlot || actionError"
              id="owner-cal-selection-error"
              class="canva-selection-bar-error"
              role="alert"
            >
              <p v-if="selectionHasUnavailableSlot">{{ t('booking.errors.slotNotAvailable') }}</p>
              <p v-if="actionError && !selectionHasUnavailableSlot">{{ actionError }}</p>
            </div>
          </div>
          <div class="canva-selection-bar-actions">
            <button
              type="button"
              class="canva-selection-bar-btn-primary"
              :aria-describedby="selectionHasUnavailableSlot || actionError ? 'owner-cal-selection-error' : undefined"
              @click="openSelectionReserve"
            >
              {{ t('owner.reserve') }}
            </button>
            <button type="button" class="canva-selection-bar-btn-secondary" :disabled="!canBatchBlock" @click="openSelectionBlock">
              {{ t('owner.block') }}
            </button>
            <button type="button" class="canva-selection-bar-btn-secondary" @click="clearSelection(); multiSelectMode = false">
              {{ t('owner.selectionBar.clear') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <OwnerLegalFooter />

    <AppModal
      :open="showDatePicker"
      patterned
      :title="t('owner.pickDate')"
      max-width-class="canva-phone-shell max-w-sm"
      @close="showDatePicker = false"
    >
      <div class="px-4 pb-5 pt-2">
        <AppJalaliCalendar
          v-model="date"
          variant="owner"
          :day-marks="occupancyMarks"
          @select="onDatePicked"
        />
      </div>
    </AppModal>

    <AppModal :open="showMenu" patterned sheet :title="slotModalTitle" max-width-class="canva-phone-shell" @close="closeMenu">
      <div class="venus-modal-shell min-h-0 flex-1">
        <div v-if="activePanel === 'detail'" class="venus-modal-panel !border-0">
          <div class="venus-modal-panel-body !pt-1">
            <div class="canva-detail-row">
              <span class="text-brand-gray-500">{{ t('owner.guestLabel') }}</span>
              <span class="max-w-[60%] text-start font-bold text-brand-navy">{{ slotGuestName() || '—' }}</span>
            </div>
            <div class="canva-detail-row">
              <span class="text-brand-gray-500">{{ t('owner.guestMobile') }}</span>
              <bdi dir="ltr" class="font-bold tabular-nums text-brand-navy">{{ activeBooking(selectedSlotFull)?.guestMobile || '—' }}</bdi>
            </div>
            <div v-if="bookingSourceLabel(activeBooking(selectedSlotFull)?.source)" class="canva-detail-row">
              <span class="text-brand-gray-500">{{ t('owner.bookingSourceLabel') }}</span>
              <span class="max-w-[60%] text-start font-bold text-brand-navy">{{ bookingSourceLabel(activeBooking(selectedSlotFull)?.source) }}</span>
            </div>
            <div v-if="!pilotNoCoach" class="canva-detail-row">
              <span class="text-brand-gray-500">{{ t('owner.coachLabel') }}</span>
              <span class="max-w-[60%] text-start font-bold text-brand-navy">{{ detailCoachLabel() }}</span>
            </div>
            <div class="canva-detail-row border-b-0">
              <span class="text-brand-gray-500">{{ t('owner.paymentStatusLabel') }}</span>
              <span class="font-bold text-brand-navy">
                {{ slotPaymentStatus(selectedSlotFull) ? t(`booking.paymentStatus.${slotPaymentStatus(selectedSlotFull)}`) : '—' }}
              </span>
            </div>

            <div v-if="showBookedCancelChecks" class="mt-3 space-y-2">
              <label
                v-for="slot in bookedSiblingSlots"
                :key="slot.id"
                class="flex flex-wrap items-center justify-start gap-x-2 gap-y-1 bg-[#eceae6] px-3 py-2.5 text-start text-xs font-bold text-brand-navy"
                style="border-radius: var(--sz-canva-radius);"
              >
                <input
                  type="checkbox"
                  class="canva-settings-checkbox"
                  :checked="isSlotSelected(slot)"
                  @change="toggleBookedSlot(slot)"
                >
                <span class="min-w-0 truncate">{{ slotRowGuestName(slot) }}</span>
                <bdi dir="ltr" class="shrink-0 tabular-nums">{{ formatTimeRange(slot.startTime, slot.endTime) }}</bdi>
                <span class="shrink-0">{{ formatDayNumber(slot.date || date) }} {{ formatMonth(slot.date || date) }}</span>
                <span class="min-w-0 truncate">{{ slotCourtName(slot) }}</span>
              </label>
            </div>

            <p v-if="actionError" class="venus-alert-error mt-3">{{ actionError }}</p>
            <!-- Desk cash collection on this sheet — online-pending walk-ins stay unpaid until marked -->
            <button
              v-if="canMarkPaid()"
              type="button"
              class="canva-detail-paid"
              :disabled="saving"
              @click="doMarkPaid"
            >
              {{ saving ? t('common.loading') : t('owner.markPaidCash') }}
            </button>
            <button
              v-if="canMarkUnpaid()"
              type="button"
              class="canva-detail-unpaid"
              :disabled="saving"
              @click="doMarkUnpaid"
            >
              {{ saving ? t('common.loading') : t('owner.markUnpaid') }}
            </button>
            <div class="canva-detail-actions">
              <button type="button" class="canva-detail-cancel" :disabled="!slotsForCancel().length" @click="openCancelForm">
                {{ t('owner.cancelBooking') }}
              </button>
              <button type="button" class="canva-detail-note" @click="openCommentsForm">
                <AppIcon name="add" size="sm" />
                {{ t('owner.addNote') }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="activePanel === 'external'" class="venus-modal-panel !border-0">
          <div class="venus-modal-panel-body !pt-1">
            <p class="mb-3 text-start text-sm leading-6 text-brand-navy/80">
              {{ t('owner.externalBookingHint') }}
            </p>
            <div
              v-for="detail in externalSourceDetails(selectedSlotFull)"
              :key="detail.source"
              class="canva-detail-row"
            >
              <span class="text-brand-gray-500">{{ t('owner.bookingSourceLabel') }}</span>
              <span class="max-w-[60%] text-start font-bold text-brand-navy">
                {{ detail.externalClubTitle ? `${detail.siteLabel} — ${detail.externalClubTitle}` : detail.siteLabel }}
              </span>
            </div>
            <div class="canva-detail-row border-b-0">
              <span class="text-brand-gray-500">{{ t('owner.externalBookingStatus') }}</span>
              <span class="font-bold text-brand-navy">{{ externalSiteBadge(selectedSlotFull) }}</span>
            </div>
            <button type="button" class="canva-gate-btn-secondary mt-4" @click="closeMenu">
              {{ t('common.close') }}
            </button>
          </div>
        </div>

        <div v-if="activePanel === 'cancel'" class="venus-modal-panel">
          <div class="venus-modal-panel-header">
            <div class="flex items-center gap-2">
              <button type="button" class="btn-ghost px-2 py-1 text-xs" @click="backToMenu">
                <span class="inline-flex items-center gap-1">
                  <AppIcon name="arrow_back" size="sm" />
                  {{ t('common.back') }}
                </span>
              </button>
              <h3 class="font-bold text-brand-navy">{{ t('owner.cancel') }}</h3>
            </div>
          </div>
          <div class="venus-modal-panel-body venus-form-stack">
            <AppFormField :label="t('owner.guestName')">
              <input v-model="form.guestName" class="neo-input" readonly aria-readonly="true">
            </AppFormField>
            <AppFormField :label="t('owner.guestFamily')">
              <input v-model="form.guestFamily" class="neo-input" readonly>
            </AppFormField>
            <AppFormField :label="t('owner.guestMobile')">
              <input v-model="form.guestMobile" dir="ltr" class="neo-input tabular-nums" readonly>
            </AppFormField>
            <p class="text-start text-xs font-bold text-brand-gray-600">{{ t('owner.cancelledSessions') }}</p>
            <ul class="space-y-1 text-start text-sm font-bold text-brand-gray-600">
              <li v-for="slot in slotsForCancel()" :key="slot.id">
                {{ formatWeekday(slot.date || date, 'long') }} {{ formatDayNumber(slot.date || date) }} {{ formatMonth(slot.date || date) }}
                · <bdi dir="ltr">{{ formatTimeLabel(slot.startTime) }}</bdi>
              </li>
            </ul>
            <label class="canva-recurring-check">
              <input v-model="refundToWallet" type="checkbox" class="canva-settings-checkbox">
              <span>{{ t('owner.refundToWalletCheck') }}</span>
            </label>
            <AppFormField :label="t('owner.cancelReasonPlaceholder')">
              <select v-model="cancelReason" class="neo-select">
                <option value="">{{ t('owner.cancelReasonPlaceholder') }}</option>
                <option v-for="reason in cancelReasons" :key="reason" :value="reason">{{ t(`owner.cancelReasons.${reason}`) }}</option>
              </select>
            </AppFormField>
          </div>
          <div class="venus-modal-footer space-y-2">
            <p v-if="actionError" class="venus-alert-error">{{ actionError }}</p>
            <button type="button" class="canva-gate-btn-primary" :disabled="!cancelReason || saving || !slotsForCancel().length" @click="doCancel">{{ t('owner.cancelBooking') }}</button>
            <button type="button" class="canva-gate-btn-secondary" @click="backToMenu">{{ t('common.back') }}</button>
          </div>
        </div>

        <div v-if="activePanel === 'reserve'" class="venus-modal-panel !border-0">
          <div class="venus-modal-panel-header !border-0 !pb-1 !pt-2">
            <div class="flex items-center gap-2">
              <button type="button" class="btn-ghost px-2 py-1 text-xs" @click="backToMenu">
                <span class="inline-flex items-center gap-1">
                  <AppIcon name="arrow_back" size="sm" />
                  {{ t('common.back') }}
                </span>
              </button>
              <h3 class="font-bold text-brand-navy">{{ reserveMenuLabel() }}</h3>
            </div>
            <div v-if="slotsForReserve().length" class="mt-1 flex flex-wrap justify-start gap-1 text-xs font-bold text-brand-gray-600">
              <span
                v-for="slot in slotsForReserve()"
                :key="slot.id"
                class="bg-brand-lavender px-2 py-0.5"
                style="border-radius: var(--sz-canva-radius);"
              >
                {{ slotCellLabel(slot) }}
              </span>
            </div>
          </div>
          <form class="venus-modal-panel-body venus-form-stack !pt-1" @submit.prevent="isNewReservation() ? openPayConfirm() : doReserve()">
            <AppFormField :label="t('owner.guestFullName')" required field-id="owner-reserve-guest-full">
              <div class="relative">
                <input
                  id="owner-reserve-guest-full"
                  v-model="guestFullName"
                  class="neo-input"
                  autocomplete="off"
                  required
                  :aria-required="true"
                  :aria-expanded="guestSearchOpen && guestSearchSource === 'name'"
                  aria-autocomplete="list"
                  aria-controls="owner-reserve-guest-suggestions-name"
                  :placeholder="t('owner.guestSearchHint')"
                  @input="onGuestFullNameInput"
                  @focus="onGuestFullNameInput"
                  @blur="closeGuestSearchSoon"
                >
                <OwnerGuestSearchDropdown
                  list-id="owner-reserve-guest-suggestions-name"
                  :open="guestSearchOpen && guestSearchSource === 'name'"
                  :pending="guestSearchPending"
                  :suggestions="guestSuggestions"
                  @select="selectGuestSuggestion"
                />
              </div>
            </AppFormField>
            <AppFormField :label="t('owner.guestMobile')" required field-id="owner-reserve-guest-mobile">
              <div class="relative">
                <input
                  id="owner-reserve-guest-mobile"
                  v-model="form.guestMobile"
                  dir="ltr"
                  class="neo-input tabular-nums"
                  autocomplete="tel"
                  inputmode="tel"
                  required
                  :aria-required="true"
                  :aria-expanded="guestSearchOpen && guestSearchSource === 'mobile'"
                  aria-autocomplete="list"
                  aria-controls="owner-reserve-guest-suggestions-mobile"
                  :placeholder="t('owner.guestSearchHint')"
                  @input="onGuestMobileInput"
                  @focus="onGuestMobileInput"
                  @blur="closeGuestSearchSoon"
                >
                <OwnerGuestSearchDropdown
                  list-id="owner-reserve-guest-suggestions-mobile"
                  :open="guestSearchOpen && guestSearchSource === 'mobile'"
                  :pending="guestSearchPending"
                  :suggestions="guestSuggestions"
                  @select="selectGuestSuggestion"
                />
              </div>
            </AppFormField>

            <div v-if="!pilotNoCoach">
              <p class="mb-2 text-xs font-bold text-brand-gray-600">{{ t('owner.sessionType') }}</p>
              <div class="canva-session-radios">
                <label class="canva-settings-radio">
                  <span class="canva-settings-radio-box" :class="sessionType === 'free' ? 'canva-settings-radio-box-on' : ''" />
                  <input v-model="sessionType" type="radio" value="free" class="sr-only">
                  <span>{{ t('owner.sessionTypeFree') }}</span>
                </label>
                <label class="canva-settings-radio">
                  <span class="canva-settings-radio-box" :class="sessionType === 'coach' ? 'canva-settings-radio-box-on' : ''" />
                  <input v-model="sessionType" type="radio" value="coach" class="sr-only">
                  <span>{{ t('owner.sessionTypeCoach') }}</span>
                </label>
              </div>
            </div>

            <div>
              <p class="mb-1 text-xs font-bold text-brand-gray-600">{{ t('owner.equipments') }}</p>
              <div v-if="rentalEquipments.length" class="space-y-0">
                <label
                  v-for="item in rentalEquipments"
                  :key="item.id"
                  class="canva-equip-row"
                >
                  <span class="inline-flex min-w-0 items-center gap-2">
                    <input
                      type="checkbox"
                      class="canva-settings-checkbox"
                      :checked="form.equipmentIds.includes(item.id)"
                      @change="toggleReserveEquipment(item.id)"
                    >
                    <span class="text-start">{{ localizedField(item, 'nameFa', 'nameEn') }}</span>
                  </span>
                  <span class="inline-flex shrink-0 items-center gap-2">
                    <span
                      v-if="form.equipmentIds.includes(item.id)"
                      class="canva-qty-step"
                    >
                      <button type="button" class="canva-qty-step-btn" @click.prevent="setEquipmentQty(item.id, equipmentQty(item.id) - 1)">−</button>
                      <span class="tabular-nums">{{ formatNumber(equipmentQty(item.id)) }}</span>
                      <button
                        type="button"
                        class="canva-qty-step-btn"
                        :disabled="equipmentQty(item.id) >= equipmentAvailable(item)"
                        @click.prevent="setEquipmentQty(item.id, equipmentQty(item.id) + 1)"
                      >+</button>
                    </span>
                    <span class="tabular-nums text-brand-gray-600">
                      {{ item.category === 'CLUB' || !item.price ? t('owner.free') : formatCurrency(item.price) }}
                    </span>
                  </span>
                </label>
              </div>
              <p v-else class="text-xs text-brand-gray-500">{{ t('common.empty') }}</p>
            </div>

            <AppFormField v-if="isEditingBooking()" :label="t('owner.slotStatusLabel')" field-id="owner-reserve-slot-status">
              <select id="owner-reserve-slot-status" v-model="form.displayStatus" class="neo-select">
                <option v-for="status in deskSlotStatuses" :key="status" :value="status">
                  {{ statusLabel(status) }}
                </option>
              </select>
            </AppFormField>
            <AppFormField v-if="isEditingBooking()" :label="t('owner.paymentMethod')" field-id="owner-reserve-payment-method">
              <select id="owner-reserve-payment-method" v-model="form.paymentMethod" class="neo-select">
                <option v-if="!payAtClubMode" value="IPG">{{ t('owner.paymentMethods.IPG') }}</option>
                <option value="CASH">{{ t('owner.paymentMethods.CASH') }}</option>
              </select>
            </AppFormField>
            <AppFormField v-if="isEditingBooking()" :label="t('owner.paymentStatusLabel')" field-id="owner-reserve-payment-status">
              <select id="owner-reserve-payment-status" v-model="form.paymentStatus" class="neo-select">
                <option value="PAY_AT_CLUB">{{ t('booking.paymentStatus.PAY_AT_CLUB') }}</option>
                <option value="PAID">{{ t('booking.paymentStatus.PAID') }}</option>
              </select>
            </AppFormField>
            <AppFormField :label="t('owner.comments')" field-id="owner-reserve-comments">
              <textarea id="owner-reserve-comments" v-model="form.comments" class="neo-textarea" rows="2" />
            </AppFormField>
          </form>
          <div class="venus-modal-footer">
            <OwnerBookingPriceSummary
              :court-price="courtPrice"
              :equipment-price="reserveEquipmentPrice"
            />
            <p v-if="!guestFieldsValid()" class="text-xs font-medium text-brand-gray-600">{{ t('owner.guestRequired') }}</p>
            <p v-if="actionError" class="venus-alert-error">{{ actionError }}</p>
            <button
              type="button"
              class="canva-gate-btn-primary"
              :disabled="!canSubmitReserve()"
              @click="isNewReservation() ? openPayConfirm() : doReserve()"
            >{{ saving ? t('common.loading') : confirmReserveLabel() }}</button>
            <button
              v-if="isEditingBooking() && canMarkPaid()"
              type="button"
              class="canva-gate-btn-primary"
              :disabled="saving"
              @click="doMarkPaid"
            >
              {{ saving ? t('common.loading') : t('owner.markPaidCash') }}
            </button>
            <button
              v-if="isEditingBooking() && canMarkUnpaid()"
              type="button"
              class="canva-gate-btn-secondary"
              :disabled="saving"
              @click="doMarkUnpaid"
            >
              {{ saving ? t('common.loading') : t('owner.markUnpaid') }}
            </button>
            <button type="button" class="canva-gate-btn-secondary" @click="backToMenu">{{ t('common.back') }}</button>
          </div>
        </div>

        <div v-if="activePanel === 'payConfirm'" class="venus-modal-panel canva-desk-pay-panel !border-0">
          <div class="venus-modal-panel-header !border-0 !pb-1 !pt-2">
            <div class="flex items-center gap-2">
              <button type="button" class="btn-ghost px-2 py-1 text-xs" @click="activePanel = 'reserve'">
                <span class="inline-flex items-center gap-1">
                  <AppIcon name="arrow_back" size="sm" />
                  {{ t('common.back') }}
                </span>
              </button>
              <h3 class="font-bold text-brand-navy">{{ t('owner.deskConfirmTitle') }}</h3>
            </div>
            <p class="mt-1 text-start text-sm font-bold text-brand-navy">{{ clubCalendarTitle }}</p>
          </div>
          <div class="venus-modal-panel-body canva-desk-pay !pt-1">
            <div class="text-start">
              <p class="canva-confirm-book-date">{{ payConfirmDateHeading }}</p>
              <div class="mt-2 flex flex-wrap justify-start gap-2">
                <span
                  v-for="slot in slotsForReserve()"
                  :key="slot.id"
                  class="canva-confirm-book-time"
                >
                  {{ slotCellLabel(slot) }}
                </span>
              </div>
              <p
                v-if="payConfirmCourtsLabel && selectionCourtNames.length <= 1"
                class="mt-2 flex items-center justify-start gap-2 text-xs font-bold text-brand-navy"
              >
                <span class="canva-confirm-book-dot" aria-hidden="true" />
                {{ payConfirmCourtsLabel }}
              </p>
            </div>
            <div class="canva-confirm-book-costs mt-4 text-start">
              <div
                v-for="(line, idx) in payConfirmCostLines"
                :key="idx"
                class="canva-confirm-book-cost-row"
              >
                <span class="canva-confirm-book-cost-label">{{ line.label }}</span>
                <span class="canva-confirm-book-cost-amount" dir="ltr">{{ formatCurrency(line.amount) }}</span>
              </div>
              <div class="canva-confirm-book-discount">
                <div class="canva-confirm-book-discount-row">
                  <input
                    v-model="deskDiscountInput"
                    type="text"
                    class="canva-confirm-book-discount-input"
                    :placeholder="t('booking.discountPlaceholder')"
                    :disabled="deskDiscountApplying || saving"
                    autocomplete="off"
                    @keydown.enter.prevent="applyDeskDiscount"
                  >
                  <button
                    v-if="deskDiscount"
                    type="button"
                    class="canva-confirm-book-discount-btn"
                    :disabled="saving"
                    @click="clearDeskDiscount"
                  >
                    {{ t('booking.discountClear') }}
                  </button>
                  <button
                    v-else
                    type="button"
                    class="canva-confirm-book-discount-btn"
                    :disabled="deskDiscountApplying || saving || !deskDiscountInput.trim()"
                    @click="applyDeskDiscount"
                  >
                    {{ deskDiscountApplying ? t('common.loading') : t('booking.discountApply') }}
                  </button>
                </div>
                <div class="mt-2 text-start">
                  <label class="canva-confirm-book-discount-note" for="owner-desk-percent">{{ t('owner.deskPercentLabel') }}</label>
                  <input
                    id="owner-desk-percent"
                    v-model="deskPercentInput"
                    type="text"
                    inputmode="numeric"
                    class="canva-confirm-book-discount-input mt-1 w-full"
                    :placeholder="t('owner.deskPercentPlaceholder')"
                    :disabled="saving"
                    autocomplete="off"
                    @input="onDeskPercentInput"
                  >
                </div>
                <p v-if="deskDiscountError" class="canva-confirm-book-discount-note text-brand-primary">{{ deskDiscountError }}</p>
                <p v-else class="canva-confirm-book-discount-note">{{ t('owner.deskPercentHint') }}</p>
              </div>
              <div class="canva-confirm-book-cost-row">
                <span class="canva-confirm-book-cost-label">{{ payConfirmDiscountLabel }}</span>
                <span class="canva-confirm-book-cost-amount" dir="ltr">{{ formatCurrency(payConfirmDiscountAmount) }}</span>
              </div>
              <div class="canva-confirm-book-cost-row font-bold text-brand-navy">
                <span>{{ t('owner.priceBreakdown.total') }}</span>
                <span dir="ltr">{{ formatCurrency(payConfirmTotal) }}</span>
              </div>
            </div>
          </div>
          <div class="venus-modal-footer space-y-2">
            <p v-if="actionError" class="venus-alert-error">{{ actionError }}</p>
            <button
              type="button"
              class="canva-gate-btn-primary w-full"
              :disabled="saving"
              @click="confirmDeskPay('cash')"
            >
              {{ saving && deskPayMode === 'cash' ? t('common.loading') : t('owner.payCash') }}
            </button>
            <button
              type="button"
              class="canva-gate-btn-secondary w-full"
              :disabled="saving"
              @click="confirmDeskPay('complimentary')"
            >
              {{ saving && deskPayMode === 'complimentary' ? t('common.loading') : t('owner.payComplimentary') }}
            </button>
            <button
              type="button"
              class="canva-desk-pay-tertiary w-full"
              :disabled="saving"
              @click="confirmDeskPay('unpaid')"
            >
              {{ saving && deskPayMode === 'unpaid' ? t('common.loading') : (payAtClubMode ? t('owner.reserveUnpaid') : t('owner.sendPayLink')) }}
            </button>
          </div>
        </div>

        <div v-if="activePanel === 'payLinkSent'" class="venus-modal-panel !border-0">
          <div class="venus-modal-panel-header !border-0 !pb-1 !pt-2">
            <h3 class="font-bold text-brand-navy">{{ t('owner.payLinkSentTitle') }}</h3>
          </div>
          <div class="venus-modal-panel-body venus-form-stack !pt-1">
            <p class="text-start text-sm text-brand-gray-600">{{ t('owner.payLinkSentHint') }}</p>
            <p v-if="lastPayLink" class="break-all text-start text-sm font-bold text-brand-navy" dir="ltr">
              {{ lastPayLink.url }}
            </p>
          </div>
          <div class="venus-modal-footer space-y-2">
            <button type="button" class="canva-gate-btn-primary w-full" @click="copyPayLink">
              {{ payLinkCopied ? t('owner.payLinkCopied') : t('owner.copyPayLink') }}
            </button>
            <a
              v-if="payLinkWhatsappHref"
              class="canva-gate-btn-secondary flex w-full items-center justify-center"
              :href="payLinkWhatsappHref"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ t('owner.sendPayLinkWhatsapp') }}
            </a>
            <button type="button" class="canva-gate-btn-secondary w-full" @click="closeMenu">
              {{ t('common.close') }}
            </button>
          </div>
        </div>

        <div v-if="activePanel === 'block'" class="venus-modal-panel">
          <div class="venus-modal-panel-header">
            <div class="flex items-center gap-2">
              <button type="button" class="btn-ghost px-2 py-1 text-xs max-[430px]:inline-flex min-[431px]:hidden" @click="backToMenu">
                <span class="inline-flex items-center gap-1">
                  <AppIcon name="arrow_back" size="sm" />
                  {{ t('common.back') }}
                </span>
              </button>
              <h3 class="font-bold text-brand-navy">{{ t('owner.blockFormTitle') }}</h3>
            </div>
          </div>
          <form class="venus-modal-panel-body venus-form-stack" @submit.prevent="doBlock">
            <ul v-if="slotsForBlock().length" class="space-y-1 text-start text-sm font-bold text-brand-navy">
              <li v-for="slot in slotsForBlock()" :key="slot.id">
                {{ slotCellLabel(slot) }}
              </li>
            </ul>
            <div class="venus-form-grid">
              <AppFormField :label="t('owner.guestName')" field-id="owner-block-guest-name">
                <input
                  id="owner-block-guest-name"
                  v-model="form.guestName"
                  class="neo-input"
                  autocomplete="given-name"
                >
              </AppFormField>
              <AppFormField :label="t('owner.guestFamily')" field-id="owner-block-guest-family">
                <input
                  id="owner-block-guest-family"
                  v-model="form.guestFamily"
                  class="neo-input"
                  autocomplete="family-name"
                >
              </AppFormField>
            </div>
            <AppFormField :label="t('owner.guestMobile')" field-id="owner-block-guest-mobile">
              <input
                id="owner-block-guest-mobile"
                v-model="form.guestMobile"
                dir="ltr"
                class="neo-input tabular-nums"
                autocomplete="tel"
                inputmode="tel"
              >
            </AppFormField>
            <AppFormField :label="t('owner.comments')" field-id="owner-block-comments">
              <textarea id="owner-block-comments" v-model="form.comments" class="neo-textarea" rows="3" />
            </AppFormField>
          </form>
          <div class="venus-modal-footer">
            <p v-if="actionError" class="venus-alert-error">{{ actionError }}</p>
            <button v-if="canUnblockSlot()" type="button" class="canva-gate-btn-secondary" :disabled="saving" @click="doUnblock">
              {{ saving ? t('common.loading') : t('owner.unblock') }}
            </button>
            <button v-if="canBlockSlot() || canUnblockSlot()" type="button" class="canva-gate-btn-primary" :disabled="saving" @click="doBlock">
              {{ saving ? t('common.loading') : (canUnblockSlot() ? t('common.save') : t('owner.confirmBlock')) }}
            </button>
            <button type="button" class="canva-gate-btn-secondary" @click="backToMenu">{{ t('common.back') }}</button>
          </div>
        </div>

        <div v-if="activePanel === 'comments'" class="venus-modal-panel">
          <div class="venus-modal-panel-header">
            <div class="flex items-center gap-2">
              <button type="button" class="btn-ghost px-2 py-1 text-xs max-[430px]:inline-flex min-[431px]:hidden" @click="backToMenu">
                <span class="inline-flex items-center gap-1">
                  <AppIcon name="arrow_back" size="sm" />
                  {{ t('common.back') }}
                </span>
              </button>
              <h3 class="font-bold text-brand-navy">{{ t('owner.comments') }}</h3>
            </div>
          </div>
          <div class="venus-modal-panel-body venus-form-stack">
            <AppFormField :label="t('owner.comments')">
              <textarea v-model="form.comments" class="neo-textarea" rows="6" />
            </AppFormField>
          </div>
          <div class="venus-modal-footer">
            <p v-if="actionError" class="venus-alert-error">{{ actionError }}</p>
            <button
              type="button"
              class="canva-gate-btn-primary"
              :disabled="saving || (!form.comments.trim() && !activeBooking(selectedSlot))"
              @click="doSaveNote"
            >
              {{ saving ? t('common.loading') : t('owner.confirmNote') }}
            </button>
          </div>
        </div>

        <div v-if="canShowSeasonReserve() && activePanel === 'season'" class="venus-modal-panel">
          <div class="venus-modal-panel-header">
            <div class="flex items-center gap-2">
              <button type="button" class="btn-ghost px-2 py-1 text-xs max-[430px]:inline-flex min-[431px]:hidden" @click="backToMenu">
                <span class="inline-flex items-center gap-1">
                  <AppIcon name="arrow_back" size="sm" />
                  {{ t('common.back') }}
                </span>
              </button>
              <h3 class="font-bold text-brand-navy">{{ t('owner.seasonPage.title') }}</h3>
            </div>
          </div>
          <div class="venus-modal-panel-body">
            <div class="flex flex-col gap-5 lg:flex-row lg:items-start">
              <div class="min-w-0 flex-1 venus-form-stack">
                <div class="venus-form-grid">
                  <AppFormField :label="t('owner.guestName')" required>
                    <input v-model="form.guestName" class="neo-input" autocomplete="given-name">
                  </AppFormField>
                  <AppFormField :label="t('owner.guestFamily')" required>
                    <input v-model="form.guestFamily" class="neo-input" autocomplete="family-name">
                  </AppFormField>
                </div>
                <AppFormField :label="t('owner.guestMobile')" required>
                  <input v-model="form.guestMobile" dir="ltr" class="neo-input tabular-nums" autocomplete="tel">
                </AppFormField>
                <AppFormField :label="t('owner.packagesPage.dateRange')" required>
                  <AppDateRangeInput
                    v-model:start="seasonForm.startDate"
                    v-model:end="seasonForm.finishDate"
                    :invalid="seasonDateRangeInvalid || seasonStartInPast"
                    :invalid-message="seasonStartInPast ? t('owner.errors.startDateInPast') : t('owner.packagesPage.dateRangeInvalid')"
                  />
                </AppFormField>
                <div>
                  <p class="mb-2 text-xs font-bold text-brand-gray-600">{{ t('owner.packagesPage.weekdays') }}</p>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="day in weekdayOptions"
                      :key="day"
                      type="button"
                      class="canva-chip"
                      :class="seasonForm.days.includes(day) ? 'canva-settings-chip-active' : 'canva-settings-chip-idle'"
                      @click="toggleSeasonDay(day)"
                    >
                      {{ t(`owner.weekdays.${day}`) }}
                    </button>
                  </div>
                </div>
                <AppFormField :label="t('owner.equipmentsPage.selectForBooking')">
                  <select v-model="seasonForm.equipmentId" class="neo-select">
                    <option value="">{{ t('owner.packagesPage.equipmentPlaceholder') }}</option>
                    <option v-for="item in rentalEquipments" :key="item.id" :value="item.id">{{ equipmentOptionLabel(item) }}</option>
                  </select>
                </AppFormField>
                <AppFormField :label="t('owner.comments')">
                  <textarea v-model="seasonForm.comments" class="neo-textarea" rows="3" />
                </AppFormField>
              </div>
              <OwnerDayTimeSchedules
                v-model:day-times="seasonForm.dayTimes"
                :days="seasonForm.days"
                :options="scheduleTimeOptions"
                class="w-full shrink-0 lg:w-52"
              />
            </div>
            <p v-if="seasonSessionLabel" class="mt-4 bg-brand-lavender px-4 py-3 text-sm font-bold text-brand-navy" style="border-radius: var(--sz-canva-radius);">
              {{ seasonSessionLabel }}
            </p>
          </div>
          <div class="venus-modal-footer">
            <OwnerBookingPriceSummary
              :court-price="courtPrice"
              :equipment-price="seasonEquipmentPrice"
              :session-count="seasonSessionCount"
              show-estimated
            />
            <p v-if="!guestFieldsValid()" class="text-xs font-medium text-brand-gray-600">{{ t('owner.guestRequired') }}</p>
            <p v-if="actionError" class="venus-alert-error">{{ actionError }}</p>
            <button type="button" class="canva-gate-btn-primary" :disabled="saving || !seasonForm.days.length || !seasonScheduleValid() || !seasonDatesValid || !guestFieldsValid()" @click="doSeasonReserve">{{ saving ? t('common.loading') : t('common.save') }}</button>
          </div>
        </div>

        <div v-if="canShowSeasonReserve() && activePanel === 'package'" class="venus-modal-panel">
          <div class="venus-modal-panel-header">
            <div class="flex items-center gap-2">
              <button type="button" class="btn-ghost px-2 py-1 text-xs max-[430px]:inline-flex min-[431px]:hidden" @click="backToMenu">
                <span class="inline-flex items-center gap-1">
                  <AppIcon name="arrow_back" size="sm" />
                  {{ t('common.back') }}
                </span>
              </button>
              <h3 class="font-bold text-brand-navy">{{ t('owner.packagePage.title') }}</h3>
            </div>
          </div>
          <div class="venus-modal-panel-body">
            <div class="flex flex-col gap-5 lg:flex-row lg:items-start">
              <div class="min-w-0 flex-1 venus-form-stack">
                <AppFormField v-if="!pilotNoCoach" :label="t('owner.packagePage.coachPlaceholder')">
                  <select v-model="packageForm.coachId" class="neo-select">
                    <option value="">{{ t('owner.packagePage.coachPlaceholder') }}</option>
                    <option v-for="coach in clubCoaches" :key="coach.id" :value="coach.id">
                      {{ localizedField(coach, 'nameFa', 'nameEn') }} — {{ formatCurrency(coach.sessionPrice) }}
                    </option>
                  </select>
                </AppFormField>
                <div class="venus-form-grid">
                  <AppFormField :label="t('owner.guestName')" required>
                    <input v-model="form.guestName" class="neo-input" autocomplete="given-name">
                  </AppFormField>
                  <AppFormField :label="t('owner.guestFamily')" required>
                    <input v-model="form.guestFamily" class="neo-input" autocomplete="family-name">
                  </AppFormField>
                </div>
                <AppFormField :label="t('owner.guestMobile')" required>
                  <input v-model="form.guestMobile" dir="ltr" class="neo-input tabular-nums" autocomplete="tel">
                </AppFormField>
                <AppFormField :label="t('owner.packagesPage.dateRange')" required>
                  <AppDateRangeInput
                    v-model:start="packageForm.startDate"
                    v-model:end="packageForm.finishDate"
                    :invalid="packageDateRangeInvalid || packageStartInPast"
                    :invalid-message="packageStartInPast ? t('owner.errors.startDateInPast') : t('owner.packagesPage.dateRangeInvalid')"
                  />
                </AppFormField>
                <div>
                  <p class="mb-2 text-xs font-bold text-brand-gray-600">{{ t('owner.packagesPage.weekdays') }}</p>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="day in weekdayOptions"
                      :key="day"
                      type="button"
                      class="canva-chip"
                      :class="packageForm.days.includes(day) ? 'canva-settings-chip-active' : 'canva-settings-chip-idle'"
                      @click="togglePackageDay(day)"
                    >
                      {{ t(`owner.weekdays.${day}`) }}
                    </button>
                  </div>
                </div>
                <AppFormField :label="t('owner.equipmentsPage.selectForBooking')">
                  <select v-model="packageForm.equipmentId" class="neo-select">
                    <option value="">{{ t('owner.packagesPage.equipmentPlaceholder') }}</option>
                    <option v-for="item in rentalEquipments" :key="item.id" :value="item.id">{{ equipmentOptionLabel(item) }}</option>
                  </select>
                </AppFormField>
                <AppFormField :label="t('owner.comments')">
                  <textarea v-model="packageForm.comments" class="neo-textarea" rows="3" />
                </AppFormField>
              </div>
              <OwnerDayTimeSchedules
                v-model:day-times="packageForm.dayTimes"
                :days="packageForm.days"
                :options="scheduleTimeOptions"
                class="w-full shrink-0 lg:w-52"
              />
            </div>
            <p v-if="packageSessionLabel" class="mt-4 bg-brand-lavender px-4 py-3 text-sm font-bold text-brand-navy" style="border-radius: var(--sz-canva-radius);">
              {{ packageSessionLabel }}
            </p>
          </div>
          <div class="venus-modal-footer">
            <OwnerBookingPriceSummary
              :court-price="courtPrice"
              :coach-price="packageForm.coachId && selectedCoach ? selectedCoach.sessionPrice : undefined"
              :equipment-price="packageEquipmentPrice"
              :session-count="packageSessionCount"
              show-estimated
            />
            <p v-if="!guestFieldsValid()" class="text-xs font-medium text-brand-gray-600">{{ t('owner.guestRequired') }}</p>
            <p v-if="actionError" class="venus-alert-error">{{ actionError }}</p>
            <button type="button" class="canva-gate-btn-primary" :disabled="saving || !packageForm.days.length || !packageScheduleValid() || !packageDatesValid || !guestFieldsValid()" @click="doPackageReserve">{{ saving ? t('common.loading') : t('common.save') }}</button>
          </div>
        </div>

        <div v-if="activePanel === 'equipment'" class="venus-modal-panel">
          <div class="venus-modal-panel-header">
            <div class="flex items-center gap-2">
              <button type="button" class="btn-ghost px-2 py-1 text-xs max-[430px]:inline-flex min-[431px]:hidden" @click="backToMenu">
                <span class="inline-flex items-center gap-1">
                  <AppIcon name="arrow_back" size="sm" />
                  {{ t('common.back') }}
                </span>
              </button>
              <h3 class="font-bold text-brand-navy">{{ t('owner.equipments') }}</h3>
            </div>
          </div>
          <div class="venus-modal-panel-body venus-form-stack">
            <AppFormField :label="t('owner.equipmentsPage.selectForBooking')">
              <OwnerEquipmentPicker
                :model-value="form.equipmentIds"
                :options="equipmentPickerOptions"
                @update:model-value="onEquipmentPickerUpdate"
              />
            </AppFormField>
          </div>
          <div class="venus-modal-footer">
            <OwnerBookingPriceSummary
              :court-price="courtPrice"
              :equipment-price="reserveEquipmentPrice"
            />
            <p v-if="actionError" class="venus-alert-error">{{ actionError }}</p>
            <button type="button" class="canva-gate-btn-primary" :disabled="saving" @click="saveEquipmentSelection">{{ saving ? t('common.loading') : t('common.save') }}</button>
          </div>
        </div>
      </div>
    </AppModal>
    </AppAsyncState>
    </div>
  </div>
</template>

<style scoped>
.slot {
  cursor: pointer;
}

.calendar-shell {
  background: #fff;
}

.calendar-grid {
  grid-template-columns: 5.5rem repeat(auto-fit, minmax(8.5rem, 1fr));
  gap: 0.75rem;
}

.calendar-toolbar-pill,
.calendar-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 0.5rem;
  border: 1px solid #e4e7ec;
  background: #fff;
  padding: 0.7rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--sz-navy);
  cursor: pointer;
  box-shadow: 0px 1px 2px 0px rgba(16, 24, 40, 0.05);
  transition: all 0.2s ease;
}

.calendar-tab-active {
  border-color: var(--sz-accent);
  background: var(--sz-accent-soft);
  color: var(--sz-accent);
  font-weight: 600;
}

.calendar-column-head {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  padding: 0.5rem 0.55rem 0.25rem;
}

.calendar-column-day {
  font-size: 0.7rem;
  font-weight: 500;
  color: #98a2b3;
}

.calendar-latin .calendar-column-day {
  letter-spacing: 0.06em;
}

.calendar-column-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--sz-navy);
}

.calendar-time-cell,
.calendar-slot-cell {
  min-height: 6rem;
  padding: 0.25rem;
}

.calendar-time-cell {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 1rem;
}

.calendar-time {
  font-size: 0.78rem;
  font-weight: 600;
  color: #98a2b3;
}

.calendar-slot-card {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 0.45rem;
  border-radius: 0.5rem;
  padding: 0.95rem;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0px 1px 2px 0px rgba(16, 24, 40, 0.05);
}

.calendar-slot-card:hover {
  transform: translateY(-2px);
  box-shadow: 0px 4px 8px -2px rgba(16, 24, 40, 0.1);
}

.calendar-slot-card.slot-selected {
  outline: 3px solid var(--sz-accent);
  outline-offset: 2px;
}

.calendar-selection-bar {
  position: fixed;
  inset-inline: 0;
  bottom: calc(var(--sz-tab-bar-height) + var(--sz-safe-bottom));
  z-index: 45;
  border-top: 1px solid #e4e7ec;
  background: rgba(255, 255, 255, 0.97);
  backdrop-filter: blur(10px);
  box-shadow: 0 -8px 24px rgba(16, 24, 40, 0.12);
  padding: 0.85rem 1rem calc(0.85rem + var(--sz-safe-bottom));
}

.calendar-selection-bar-inner {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 100%;
}

.calendar-selection-bar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.calendar-page-has-selection {
  padding-bottom: calc(10rem + var(--sz-tab-bar-height) + var(--sz-safe-bottom));
}

.calendar-page-has-selection :deep(.canva-cal-grid-scroll) {
  padding-bottom: 1.25rem;
}

@media (min-width: 431px) {
  .calendar-page-has-selection {
    padding-bottom: 12rem;
  }
}

@media (min-width: 1024px) {
  .calendar-selection-bar {
    inset-inline-start: var(--sz-side-nav-width);
    inset-inline-end: 0;
    bottom: 0;
    padding: 1rem 2rem;
  }

  .calendar-selection-bar-inner {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin: 0 auto;
    max-width: none;
  }

  .calendar-selection-bar-actions {
    flex-wrap: nowrap;
    shrink: 0;
  }

  .calendar-page-has-selection {
    padding-bottom: 8rem;
  }
}

.calendar-slot-time {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  opacity: 0.8;
}

.calendar-slot-title {
  font-size: 0.84rem;
  font-weight: 700;
  line-height: 1.35;
}

.calendar-slot-meta {
  font-size: 0.72rem;
  line-height: 1.4;
  opacity: 0.78;
}

.calendar-slot-pay {
  display: inline-block;
  margin-top: 0.15rem;
  padding: 0.1rem 0.35rem;
  border-radius: 0.25rem;
  font-size: 0.62rem;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0.02em;
  width: fit-content;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar-slot-pay-unpaid {
  background: rgba(255, 251, 235, 0.95);
  color: #b45309;
}

.calendar-slot-pay-paid {
  background: rgba(236, 253, 245, 0.95);
  color: #047857;
}

.neo-menu-item-paid {
  color: #047857;
  font-weight: 800;
}

.neo-menu-item-unpaid {
  color: #b45309;
  font-weight: 800;
}

.calendar-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  border-radius: 0.5rem;
  background: #f9fafb;
  padding: 0.7rem 0.95rem;
  font-size: 0.78rem;
  font-weight: 500;
  color: #344054;
}

.calendar-legend-dot {
  height: 0.7rem;
  width: 0.7rem;
  border-radius: 999px;
}

:deep(.canva-cal-grid-cell.slot-free) {
  background: var(--sz-cal-grid-free);
  color: #4a4a46;
}

:deep(.canva-cal-grid-cell.slot-past) {
  background: #dedcd8;
  color: #8e8c88;
}

:deep(.canva-cal-grid-cell.slot-reserved),
:deep(.canva-cal-grid-cell.slot-reserved-cash),
:deep(.canva-cal-grid-cell.slot-public),
:deep(.canva-cal-grid-cell.slot-team) {
  background: var(--sz-cal-grid-reserved-paid);
  color: #2c2c2a;
}

:deep(.canva-cal-grid-cell.slot-blocked) {
  background: var(--sz-cal-grid-blocked);
  color: #2c2c2a;
}

:deep(.canva-cal-grid-cell.slot-reserved-unpaid) {
  background: var(--sz-cal-grid-reserved-unpaid);
  color: #2c2c2a;
}

:deep(.canva-cal-grid-cell.slot-reserved-ipg) {
  background: var(--sz-cal-grid-reserved-ipg);
  color: #2c2c2a;
}

:deep(.canva-cal-grid-cell.slot-pending) {
  background: var(--sz-cal-grid-pending);
  color: #2c2c2a;
}

:deep(.canva-cal-grid-cell.slot-cancel) {
  background: #eceae6;
  color: #4a4a46;
}

:deep(.canva-cal-grid-cell.slot-closed) {
  background: #2a2a28;
  color: #fff;
}

@media (max-width: 640px) {
  .calendar-time-cell,
  .calendar-slot-cell {
    min-height: 6.25rem;
  }
}
</style>
