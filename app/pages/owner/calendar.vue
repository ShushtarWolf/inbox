<script setup lang="ts">
import { isoToJalaali, jalaaliDaysInMonth, jalaaliToIso, PERSIAN_MONTHS } from '#shared/jalali.ts'
import { palette } from '#shared/palette.ts'
import { isPaidPaymentStatus, isUnpaidPaymentStatus } from '#shared/bookingPayment.ts'
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

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

interface OwnerCalendarBookingEquipment {
  equipmentId: string
  priceAtBooking: number
  quantity?: number
  equipment?: { id: string; nameFa: string; nameEn: string; price: number; category: string; quantity?: number } | null
}

interface OwnerCalendarBooking {
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

type ActivePanel = 'cancel' | 'reserve' | 'payConfirm' | 'season' | 'package' | 'comments' | 'equipment' | 'block' | 'detail' | null

const { t, locale } = useI18n()
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
const selectionCourtId = ref<string | null>(null)
const multiSelectMode = ref(false)
const showMenu = ref(false)
const activePanel = ref<ActivePanel>(null)
const cancelReason = ref('')
const refundToWallet = ref(true)
const saving = ref(false)
const actionError = ref('')
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

const { data: equipments } = await useAuthedFetch('/api/owner/equipments')
const { data: staffData } = await useAuthedFetch('/api/owner/staff')

const { data, pending, error, refresh } = await useAuthedFetch('/api/owner/calendar', {
  query: computed(() => ({ date: date.value })),
})

useOwnerClubRefresh(refresh)

watch(date, () => {
  clearSelection()
  refresh()
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
  data.value?.slots?.forEach((s: { startTime: string }) => set.add(s.startTime))
  return [...set].sort()
})

const courts = computed(() => data.value?.courts || [])

const gridTemplateColumns = computed(() => {
  const courtCount = Math.max(courts.value.length, 1)
  // RTL: first column is the time gutter on the RIGHT, then courts going left — Canva (9).
  return `2.75rem repeat(${courtCount}, minmax(5.5rem, 1fr))`
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
  if (!activeCourtId.value || !list.some((court: { id: string }) => court.id === activeCourtId.value)) {
    activeCourtId.value = list[0].id
  }
}, { immediate: true })

const activeCourt = computed(() =>
  courts.value.find((court: { id: string }) => court.id === activeCourtId.value) || null,
)

watch(activeCourtId, () => {
  clearSelection()
})

const overviewStats = computed(() => {
  const slots = (data.value?.slots || []) as OwnerCalendarSlot[]
  const bookable = slots.filter((slot) => slot.displayStatus !== 'CLOSED')
  const free = bookable.filter((slot) => slot.displayStatus === 'FREE')
  const reserved = bookable.filter((slot) =>
    slot.displayStatus === 'RESERVED' || slot.displayStatus === 'PENDING' || Boolean(slot.booking),
  )
  const freePct = bookable.length ? Math.round((free.length / bookable.length) * 100) : 0
  const reservedPct = bookable.length ? Math.round((reserved.length / bookable.length) * 100) : 0
  const perCourt = courts.value.map((court: { id: string; nameFa: string; nameEn: string }) => {
    const courtSlots = bookable.filter((slot) => slot.courtId === court.id)
    const used = courtSlots.filter((slot) => slot.displayStatus !== 'FREE').length
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
  const court = courts.value.find((item: { id: string }) => item.id === selectedSlotFull.value?.courtId)
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
/** Canva owner hero uses the people/promo frame (same asset as athlete home), not club court crop. */
const clubHeroImage = '/hero/fitness-venue.jpg'
const localePath = useLocalePath()

let longPressTimer: ReturnType<typeof setTimeout> | null = null
let longPressFired = false

function clearLongPressTimer() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function onSlotPointerDown(slot: OwnerCalendarSlot) {
  if (slot.displayStatus !== 'FREE') return
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
const clubCoaches = computed(() =>
  pilotNoCoach.value
    ? []
    : (staffData.value?.staff || [])
        .filter((member: { coach?: { id: string; sessionPrice?: number } | null }) => member.coach)
        .map((member: { coach: { id: string; nameFa: string; nameEn: string; sessionPrice: number } }) => member.coach),
)
const selectedSlotFull = computed(() => {
  if (!selectedSlot.value?.id) return null
  return data.value?.slots?.find((s: { id: string }) => s.id === selectedSlot.value!.id) || selectedSlot.value
})
const selectedSlotsFull = computed(() =>
  selectedSlotIds.value
    .map((id) => data.value?.slots?.find((s: OwnerCalendarSlot) => s.id === id))
    .filter(Boolean)
    .sort((a: OwnerCalendarSlot, b: OwnerCalendarSlot) => a.startTime.localeCompare(b.startTime)) as OwnerCalendarSlot[],
)
const selectionCourt = computed(() =>
  courts.value.find((court: { id: string }) => court.id === selectionCourtId.value) || null,
)
const payConfirmCourt = computed(() => {
  const id = selectedSlot.value?.courtId || selectionCourtId.value || activeCourtId.value
  return courts.value.find((court: { id: string }) => court.id === id) || null
})
const batchMode = computed(() => selectedSlotIds.value.length > 1 && showMenu.value)
const canBatchReserve = computed(() =>
  selectedSlotsFull.value.length > 0
    && selectedSlotsFull.value.every((slot) => slot.displayStatus === 'FREE')
    && !selectedSlotsFull.value.some(slotIsInPast),
)
const canBatchBlock = computed(() =>
  selectedSlotsFull.value.length > 0
    && selectedSlotsFull.value.every((slot) => slot.displayStatus === 'FREE'),
)
const courtPrice = computed(() => {
  if (batchMode.value && activePanel.value === 'reserve') {
    return selectedSlotsFull.value.reduce((sum, slot) => sum + (slot.price ?? 0), 0)
  }
  return selectedSlotFull.value?.price ?? 0
})
const selectedCoach = computed(() => {
  if (!packageForm.coachId) return null
  return clubCoaches.value.find((coach: { id: string }) => coach.id === packageForm.coachId) || null
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

function slotClass(status: string) {
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
  return map[status] || 'slot-free'
}

function statusLabel(status: string) {
  return t(`owner.status.${status}`)
}

function cellSlot(courtId: string, hour: string) {
  return data.value?.slots?.find((s: OwnerCalendarSlot) => s.courtId === courtId && s.startTime === hour)
}

function slotGuestLine(slot: OwnerCalendarSlot | null | undefined) {
  if (!slot || slot.displayStatus === 'FREE') return ''
  if (slot.displayStatus === 'BLOCKED' || slot.displayStatus === 'CLOSED') {
    return slot.booking?.comments?.trim() || t('owner.slotBlockedLabel')
  }
  const fullName = [slot.booking?.guestName, slot.booking?.guestFamily].filter(Boolean).join(' ').trim()
  return fullName || statusLabel(slot.displayStatus)
}

function slotNoteLine(slot: OwnerCalendarSlot | null | undefined) {
  if (!slot || slot.displayStatus === 'FREE') return ''
  if (slot.displayStatus === 'BLOCKED' || slot.displayStatus === 'CLOSED') return ''
  return slot.booking?.comments?.trim() || ''
}

function onCellCheckClick(event: Event, slot: OwnerCalendarSlot | null | undefined) {
  event.stopPropagation()
  event.preventDefault()
  if (!slot || slot.displayStatus !== 'FREE') return
  multiSelectMode.value = true
  toggleFreeSlot(slot)
}

function slotPaymentStatus(slot: OwnerCalendarSlot | null | undefined) {
  if (!slot?.booking) return null
  return slot.booking.payment?.status || slot.booking.paymentStatus || null
}

function slotMeta(slot: OwnerCalendarSlot | null | undefined) {
  if (!slot || slot.displayStatus === 'FREE' || slot.displayStatus === 'BLOCKED')
    return ''

  return slot.booking?.guestMobile || ''
}

function slotPaymentBadge(slot: OwnerCalendarSlot | null | undefined) {
  const status = slotPaymentStatus(slot)
  if (!status || slot?.displayStatus === 'FREE' || slot?.displayStatus === 'BLOCKED')
    return ''
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
  if (slot.displayStatus === 'BLOCKED') return 'block'
  if (slot.displayStatus === 'CLOSED') return 'comments'
  if (slot.booking || (slot.displayStatus !== 'FREE' && slot.displayStatus !== 'BLOCKED')) return 'detail'
  // Free slot: Canva shows the 3-action menu first (no nested panel yet).
  return null
}

function courtColumnLabel(court: { nameFa: string; nameEn: string }, index: number) {
  const name = localizedField(court, 'nameFa', 'nameEn')
  return name || t('booking.courtNumber', { n: formatNumber(index + 1) })
}

function hasSlotNote(slot: OwnerCalendarSlot | null | undefined) {
  return Boolean(slot?.booking?.comments?.trim())
}

function gridCellBarClass(status: string) {
  const map: Record<string, string> = {
    FREE: 'canva-cal-grid-cell-bar-free',
    RESERVED: 'canva-cal-grid-cell-bar-reserved',
    PUBLIC: 'canva-cal-grid-cell-bar-public',
    TEAM: 'canva-cal-grid-cell-bar-team',
    PENDING: 'canva-cal-grid-cell-bar-pending',
    CANCELLED: 'canva-cal-grid-cell-bar-cancel',
    CLOSED: 'canva-cal-grid-cell-bar-closed',
    BLOCKED: 'canva-cal-grid-cell-bar-blocked',
  }
  return map[status] || 'canva-cal-grid-cell-bar-free'
}

function openFabReserve() {
  if (canBatchReserve.value) {
    openSelectionReserve()
    return
  }
  multiSelectMode.value = true
  actionError.value = ''
}

function openFabBlock() {
  if (canBatchBlock.value) {
    openSelectionBlock()
    return
  }
  multiSelectMode.value = true
  actionError.value = ''
}

const guestFullName = computed({
  get() {
    return [form.guestName, form.guestFamily].filter(Boolean).join(' ').trim()
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

function onGuestFullNameInput() {
  scheduleGuestSearch(guestFullName.value)
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
  const booking = selectedSlotFull.value?.booking
  if (!booking?.coachId) return t('owner.sessionTypeFree')
  const coach = clubCoaches.value.find((item: { id: string }) => item.id === booking.coachId)
  if (!coach) return t('owner.sessionTypeCoach')
  return localizedField(coach, 'nameFa', 'nameEn')
}

function menuButtonClass(panel: ActivePanel) {
  const base = 'neo-menu-item'
  return activePanel.value === panel ? `${base} neo-menu-item-active` : base
}

function menuItemClass(panel: ActivePanel) {
  const base = 'canva-action-row'
  return activePanel.value === panel ? `${base} canva-action-row-active` : base
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

function sumEquipmentIds(ids: string[], quantities?: Record<string, number>) {
  return (equipments.value || [])
    .filter((item: { id: string }) => ids.includes(item.id))
    .reduce((sum: number, item: { id: string; category: string; price: number }) => {
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
  selectionCourtId.value = null
}

function isSlotSelected(slot: OwnerCalendarSlot) {
  return selectedSlotIds.value.includes(slot.id)
}

function toggleFreeSlot(slot: OwnerCalendarSlot) {
  if (selectionCourtId.value && selectionCourtId.value !== slot.courtId) {
    selectedSlotIds.value = [slot.id]
    selectionCourtId.value = slot.courtId
    return
  }
  if (isSlotSelected(slot)) {
    selectedSlotIds.value = selectedSlotIds.value.filter((id) => id !== slot.id)
    if (!selectedSlotIds.value.length) selectionCourtId.value = null
    return
  }
  if (!selectionCourtId.value) selectionCourtId.value = slot.courtId
  selectedSlotIds.value = [...selectedSlotIds.value, slot.id]
}

function handleSlotClick(slot: OwnerCalendarSlot | null | undefined) {
  if (!slot) return
  if (longPressFired) {
    longPressFired = false
    return
  }
  const fullSlot = (data.value?.slots?.find((s: { id: string }) => s.id === slot.id) || slot) as OwnerCalendarSlot
  if (fullSlot.displayStatus !== 'FREE') {
    clearSelection()
    openSlot(fullSlot)
    return
  }
  // Multi-select only while already selecting free slots; first tap opens desk sheet.
  if (selectedSlotIds.value.length > 0 || multiSelectMode.value) {
    toggleFreeSlot(fullSlot)
    return
  }
  openSlot(fullSlot)
}

function openSelectionReserve() {
  if (!canBatchReserve.value || !selectedSlotsFull.value.length) return
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
  const fullSlot = (data.value?.slots?.find((s: { id: string }) => s.id === slot.id) || slot) as OwnerCalendarSlot
  if (!opts?.keepSelection) clearSelection()
  selectedSlot.value = fullSlot
  showMenu.value = true
  resetPanels()
  activePanel.value = defaultPanelForSlot(fullSlot)
  cancelReason.value = 'CUSTOMER_REQUEST'
  refundToWallet.value = true
  actionError.value = ''
  sessionType.value = fullSlot.booking?.coachId && !pilotNoCoach.value ? 'coach' : 'free'
  const isFree = fullSlot.displayStatus === 'FREE'
  form.guestName = isFree ? '' : (fullSlot.booking?.guestName || '')
  form.guestFamily = isFree ? '' : (fullSlot.booking?.guestFamily || '')
  form.guestMobile = isFree ? '' : (fullSlot.booking?.guestMobile || '')
  clearGuestSearch()
  const existingMethod = fullSlot.booking?.payment?.method || fullSlot.booking?.paymentMethod || 'CASH'
  form.paymentMethod = isFree
    ? 'CASH'
    : (existingMethod === 'IPG' && !payAtClubMode.value ? 'IPG' : 'CASH')
  form.paymentStatus = isFree ? 'PAY_AT_CLUB' : (fullSlot.booking?.payment?.status || fullSlot.booking?.paymentStatus || 'PAY_AT_CLUB')
  form.comments = isFree ? '' : (fullSlot.booking?.comments || '')
  form.displayStatus = isFree ? 'RESERVED' : fullSlot.displayStatus
  const equipmentIds = isFree ? [] : (fullSlot.booking?.bookingEquipments?.map((item) => item.equipmentId) || [])
  form.equipmentIds = equipmentIds
  const quantities: Record<string, number> = {}
  if (!isFree) {
    for (const row of fullSlot.booking?.bookingEquipments || []) {
      quantities[row.equipmentId] = Math.max(1, row.quantity || 1)
    }
  }
  form.equipmentQuantities = quantities
  const defaultRange = defaultDayRange(fullSlot)
  const anchorDay = weekdayNameFromDate(fullSlot.date)
  seasonForm.startDate = ''
  seasonForm.finishDate = ''
  seasonForm.days = [anchorDay]
  seasonForm.dayTimes = ensureDayTimesForDays({}, [anchorDay], defaultRange)
  seasonForm.equipmentId = equipmentIds[0] || ''
  seasonForm.comments = fullSlot.booking?.comments || ''
  packageForm.coachId = pilotNoCoach.value ? '' : (fullSlot.booking?.coachId || '')
  packageForm.startDate = ''
  packageForm.finishDate = ''
  packageForm.days = [anchorDay]
  packageForm.dayTimes = ensureDayTimesForDays({}, [anchorDay], defaultRange)
  packageForm.equipmentId = equipmentIds[0] || ''
  packageForm.comments = fullSlot.booking?.comments || ''
}

function openReserveForm() {
  activePanel.value = 'reserve'
}

function openCancelForm() {
  cancelReason.value = cancelReason.value || 'CUSTOMER_REQUEST'
  refundToWallet.value = true
  activePanel.value = 'cancel'
}

function openPayConfirm() {
  if (!canSubmitReserve()) return
  deskDiscountInput.value = ''
  deskDiscountError.value = ''
  deskDiscount.value = null
  activePanel.value = 'payConfirm'
}

async function confirmDeskPay(mode: 'cash' | 'link') {
  if (mode === 'cash') {
    form.paymentMethod = 'CASH'
    form.paymentStatus = 'PAID'
  } else {
    form.paymentMethod = payAtClubMode.value ? 'CASH' : 'IPG'
    form.paymentStatus = 'PAY_AT_CLUB'
  }
  await doReserve()
}

function openCommentsForm() {
  activePanel.value = 'comments'
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

function openBlockForm() {
  activePanel.value = 'block'
}

function closeMenu() {
  showMenu.value = false
  resetPanels()
  cancelReason.value = ''
  actionError.value = ''
  if (!multiSelectMode.value) clearSelection()
}

function backToMenu() {
  activePanel.value = null
  actionError.value = ''
}

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
  return Boolean(selectedSlot.value?.booking) && !batchMode.value
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
  if (batchMode.value && activePanel.value === 'reserve') return selectedSlotsFull.value
  if (selectedSlotFull.value) return [selectedSlotFull.value]
  return []
}

function slotsForCancel() {
  if (batchMode.value && activePanel.value === 'cancel') return selectedSlotsFull.value
  if (selectedSlotFull.value?.booking) return [selectedSlotFull.value]
  return []
}

function slotsForBlock() {
  if (batchMode.value && activePanel.value === 'block') return selectedSlotsFull.value
  if (selectedSlotFull.value) return [selectedSlotFull.value]
  return []
}

async function doReserve() {
  const targets = slotsForReserve()
  if (!targets.length || saving.value || !canSubmitReserve()) return
  if (!form.guestFamily.trim()) form.guestFamily = form.guestName.trim()
  saving.value = true
  actionError.value = ''
  try {
    const groups = new Map<string, typeof targets>()
    for (const slot of targets) {
      const key = `${slot.date || ''}|${slot.courtId}`
      const list = groups.get(key) || []
      list.push(slot)
      groups.set(key, list)
    }
    for (const group of groups.values()) {
      const range = bookingTimeRange(group)
      for (let i = 0; i < group.length; i++) {
        const slot = group[i]!
        const isLast = i === group.length - 1
        await $fetch('/api/owner/reserve', {
          method: 'POST',
          body: {
            slotId: slot.id,
            guestName: form.guestName,
            guestFamily: form.guestFamily,
            guestMobile: form.guestMobile,
            paymentMethod: form.paymentMethod,
            paymentStatus: form.paymentStatus,
            comments: form.comments,
            equipmentIds: form.equipmentIds,
            equipmentQuantities: equipmentQuantitiesPayload(),
            discountCode: deskDiscount.value?.code,
            displayStatus: slot.displayStatus === 'FREE' ? 'RESERVED' : reserveDisplayStatus(),
            skipNotify: !isLast,
            notifyStartTime: range.startTime,
            notifyEndTime: range.endTime,
          },
        })
      }
    }
    multiSelectMode.value = false
    closeMenu()
    clearSelection()
    await refresh()
  } catch {
    actionError.value = t('common.error')
  } finally {
    saving.value = false
  }
}

async function doCancel() {
  const targets = slotsForCancel()
  if (!targets.length || !cancelReason.value || saving.value) return
  saving.value = true
  actionError.value = ''
  try {
    for (const slot of targets) {
      await $fetch('/api/owner/cancel', {
        method: 'POST',
        body: {
          slotId: slot.id,
          reason: cancelReason.value,
          refundToWallet: refundToWallet.value,
        },
      })
    }
    closeMenu()
    await refresh()
  } catch {
    actionError.value = t('common.error')
  } finally {
    saving.value = false
  }
}

/** One-click cash collection for pay-at-club desk ops. */
async function doMarkPaid() {
  const slot = selectedSlotFull.value
  const booking = slot?.booking
  if (!slot || !booking || !canMarkPaid() || saving.value) return
  saving.value = true
  actionError.value = ''
  try {
    await $fetch('/api/owner/reserve', {
      method: 'POST',
      body: {
        slotId: slot.id,
        guestName: booking.guestName || form.guestName,
        guestFamily: booking.guestFamily || form.guestFamily,
        guestMobile: booking.guestMobile || form.guestMobile,
        paymentMethod: 'CASH',
        paymentStatus: 'PAID',
        comments: booking.comments || form.comments,
        equipmentIds: (booking.bookingEquipments || []).map((item) => item.equipmentId),
        equipmentQuantities: Object.fromEntries(
          (booking.bookingEquipments || []).map((item) => [item.equipmentId, Math.max(1, item.quantity || 1)]),
        ),
        displayStatus: slot.displayStatus === 'FREE' ? 'RESERVED' : slot.displayStatus,
      },
    })
    form.paymentMethod = 'CASH'
    form.paymentStatus = 'PAID'
    closeMenu()
    await refresh()
  } catch {
    actionError.value = t('common.error')
  } finally {
    saving.value = false
  }
}

/** Reverse a mistaken cash mark (or wallet-paid mark) back to unpaid. */
async function doMarkUnpaid() {
  const slot = selectedSlotFull.value
  const booking = slot?.booking
  if (!slot || !booking || !canMarkUnpaid() || saving.value) return
  saving.value = true
  actionError.value = ''
  try {
    await $fetch('/api/owner/reserve', {
      method: 'POST',
      body: {
        slotId: slot.id,
        guestName: booking.guestName || form.guestName,
        guestFamily: booking.guestFamily || form.guestFamily,
        guestMobile: booking.guestMobile || form.guestMobile,
        paymentMethod: 'CASH',
        paymentStatus: 'PAY_AT_CLUB',
        comments: booking.comments || form.comments,
        equipmentIds: (booking.bookingEquipments || []).map((item) => item.equipmentId),
        equipmentQuantities: Object.fromEntries(
          (booking.bookingEquipments || []).map((item) => [item.equipmentId, Math.max(1, item.quantity || 1)]),
        ),
        displayStatus: slot.displayStatus === 'FREE' ? 'RESERVED' : slot.displayStatus,
      },
    })
    form.paymentMethod = 'CASH'
    form.paymentStatus = 'PAY_AT_CLUB'
    closeMenu()
    await refresh()
  } catch {
    actionError.value = t('common.error')
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
    await $fetch('/api/owner/block', {
      method: 'POST',
      body: {
        slotIds,
        guestName: form.guestName,
        guestFamily: form.guestFamily,
        guestMobile: form.guestMobile,
        comments: form.comments,
      },
    })
    closeMenu()
    await refresh()
  } catch {
    actionError.value = t('common.error')
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
    closeMenu()
    await refresh()
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
    await $fetch('/api/owner/season', {
      method: 'POST',
      body: {
        guestName: form.guestName,
        guestFamily: form.guestFamily,
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
    closeMenu()
    await refresh()
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
    await $fetch('/api/owner/package-reserve', {
      method: 'POST',
      body: {
        guestName: form.guestName,
        guestFamily: form.guestFamily,
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
    closeMenu()
    await refresh()
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
    await $fetch('/api/owner/reserve', {
      method: 'POST',
      body: {
        slotId: selectedSlot.value.id,
        guestName: form.guestName,
        guestFamily: form.guestFamily,
        guestMobile: form.guestMobile,
        paymentMethod: form.paymentMethod,
        paymentStatus: form.paymentStatus,
        comments: form.comments,
        equipmentIds: form.equipmentIds,
        equipmentQuantities: equipmentQuantitiesPayload(),
        displayStatus: reserveDisplayStatus(),
      },
    })
    closeMenu()
    await refresh()
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
  return Boolean(selectedSlot.value?.booking) && selectedSlot.value?.displayStatus !== 'BLOCKED'
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
  if (batchMode.value || !selectedSlotFull.value?.booking) return false
  if (selectedSlotFull.value.displayStatus === 'BLOCKED') return false
  const status = slotPaymentStatus(selectedSlotFull.value)
  return isUnpaidPaymentStatus(status)
}

function canMarkUnpaid() {
  if (batchMode.value || !selectedSlotFull.value?.booking) return false
  if (selectedSlotFull.value.displayStatus === 'BLOCKED') return false
  if (!isPaidPaymentStatus(slotPaymentStatus(selectedSlotFull.value))) return false
  // IPG PAID → cancel for reverse/wallet; desk mark-unpaid only cash/wallet.
  const method = selectedSlotFull.value.booking.payment?.method
    || selectedSlotFull.value.booking.paymentMethod
  return method !== 'IPG'
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
  if (slot.booking?.guestMobile) parts.push(slot.booking.guestMobile)
  return parts.join(' · ')
}

function slotGuestName() {
  if (!selectedSlot.value?.booking) return ''
  return [selectedSlot.value.booking.guestName, selectedSlot.value.booking.guestFamily].filter(Boolean).join(' ').trim()
}

const cancelReasons = ['CUSTOMER_REQUEST', 'NO_PAYMENT', 'SCHEDULE_CONFLICT'] as const

const rentalEquipments = computed(() =>
  (equipments.value || []).filter((item: { category: string }) => item.category === 'CLUB' || item.category === 'RENTAL'),
)

const equipmentPickerOptions = computed(() =>
  rentalEquipments.value.map((item: { id: string; nameFa: string; nameEn: string; category: string; price: number }) => ({
    id: item.id,
    label: equipmentOptionLabel(item),
  })),
)

function slotButtonClass(slot: OwnerCalendarSlot) {
  const classes = [slotClass(slot.displayStatus), 'slot', 'calendar-slot-card', 'w-full', 'text-start']
  if (isSlotSelected(slot)) classes.push('slot-selected')
  return classes
}

function isNewReservation() {
  if (batchMode.value) return true
  return selectedSlot.value?.displayStatus === 'FREE'
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
  const stockItem = (equipments.value || []).find((item: { id: string }) => item.id === id) as { quantity?: number } | undefined
  const stock = equipmentStock(stockItem || {})
  if (stock < 1) return
  form.equipmentIds = [...form.equipmentIds, id]
  form.equipmentQuantities = { ...form.equipmentQuantities, [id]: 1 }
}

function equipmentQty(id: string) {
  if (!form.equipmentIds.includes(id)) return 0
  return Math.max(1, form.equipmentQuantities[id] || 1)
}

function setEquipmentQty(id: string, qty: number) {
  const stockItem = (equipments.value || []).find((item: { id: string }) => item.id === id) as { quantity?: number } | undefined
  const stock = equipmentStock(stockItem || {})
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
      const stockItem = (equipments.value || []).find((item: { id: string }) => item.id === id) as { quantity?: number } | undefined
      if (equipmentStock(stockItem || {}) < 1) continue
      quantities[id] = 1
    }
  }
  for (const id of previous) {
    if (!nextIds.includes(id)) delete quantities[id]
  }
  form.equipmentIds = nextIds.filter((id) => {
    const stockItem = (equipments.value || []).find((item: { id: string }) => item.id === id) as { quantity?: number } | undefined
    return equipmentStock(stockItem || {}) >= 1
  })
  form.equipmentQuantities = quantities
}

const payConfirmDateHeading = computed(() => {
  const j = isoToJalaali(date.value)
  return `${weekdayLabel.value} ${formatNumber(j.jd)} ${PERSIAN_MONTHS[j.jm - 1]}`
})

const payConfirmCostLines = computed(() => {
  const lines: Array<{ label: string; amount: number }> = []
  for (const slot of slotsForReserve()) {
    lines.push({
      label: t('booking.confirmLineSlot', {
        date: payConfirmDateHeading.value,
        time: slot.startTime?.slice(0, 5) || '',
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
const payConfirmDiscountAmount = computed(() => deskDiscount.value?.discountAmount || 0)
const payConfirmTotal = computed(() => Math.max(0, payConfirmSubtotal.value - payConfirmDiscountAmount.value))

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
}

function slotIsInPast(slot: OwnerCalendarSlot) {
  const slotDate = slot.date || date.value
  return isSlotStartInPast(slotDate, slot.startTime)
}

function canSubmitReserve() {
  if (saving.value) return false
  if (!guestFieldsValid()) return false
  if (isNewReservation() && slotsForReserve().some(slotIsInPast)) return false
  return true
}

function reserveFormTitle() {
  return isEditingBooking() ? t('owner.editBookingTitle') : t('owner.reserveFormTitle')
}

function confirmReserveLabel() {
  return isNewReservation() ? t('owner.confirmReserve') : t('common.save')
}

const legend = [
  { status: 'FREE', color: 'transparent' },
  { status: 'RESERVED', color: '#C41E1E' },
  { status: 'PENDING', color: '#E8B84A' },
  { status: 'BLOCKED', color: '#1A1A18' },
]

function slotBarColor(status: string) {
  if (status === 'PENDING') return palette.slotDisplay.PENDING
  if (status === 'BLOCKED' || status === 'CLOSED' || status === 'CANCELLED') return palette.slotDisplay.BLOCKED
  if (status === 'FREE') return palette.slotDisplay.FREE
  return palette.slotDisplay.RESERVED
}
</script>

<template>
  <div class="venus-page-stack owner-cal-page" :class="{ 'calendar-page-has-selection': selectedSlotIds.length }">
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
        class="canva-promo-badge canva-promo-badge-hero"
        :aria-label="t('owner.calendarPromo')"
      >
        <span class="canva-promo-badge-pct">۲۰٪</span>
        <span class="canva-promo-badge-label">{{ t('owner.calendarPromoShort') }}</span>
      </div>
      <div class="canva-photo-hero-body !min-h-[9.5rem] !pb-8 min-[431px]:!min-h-[12rem]" />
    </section>

    <div class="canva-cal-sheet -mx-4 min-[431px]:mx-0">
      <h1 class="text-start text-base font-bold text-brand-navy">{{ clubCalendarTitle }}</h1>
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

    <section v-else class="space-y-3" :class="locale === 'en' ? 'calendar-latin' : ''">
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
          <div class="canva-cal-date-nav-gutter" aria-hidden="true" />
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
          <div class="canva-cal-fab">
            <button type="button" class="canva-cal-fab-btn canva-cal-fab-block" @click="openFabBlock">
              {{ t('owner.block') }}
            </button>
            <button type="button" class="canva-cal-fab-btn canva-cal-fab-reserve" @click="openFabReserve">
              {{ t('owner.reserve') }}
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
                  :class="[
                    slotClass(cellSlot(court.id, hour)?.displayStatus || 'FREE'),
                    cellSlot(court.id, hour) && isSlotSelected(cellSlot(court.id, hour)!) ? 'canva-cal-grid-cell-selected' : '',
                  ]"
                  :disabled="!cellSlot(court.id, hour)"
                  @pointerdown="cellSlot(court.id, hour) && onSlotPointerDown(cellSlot(court.id, hour)!)"
                  @pointerup="onSlotPointerEnd"
                  @pointerleave="onSlotPointerEnd"
                  @pointercancel="onSlotPointerEnd"
                  @contextmenu.prevent
                  @click="handleSlotClick(cellSlot(court.id, hour))"
                >
                  <span
                    v-if="cellSlot(court.id, hour) && cellSlot(court.id, hour)!.displayStatus !== 'FREE'"
                    class="canva-cal-grid-cell-bar"
                    :class="gridCellBarClass(cellSlot(court.id, hour)?.displayStatus || 'FREE')"
                  />
                  <span v-if="hasSlotNote(cellSlot(court.id, hour))" class="canva-cal-grid-note" aria-hidden="true">★</span>
                  <span class="canva-cal-grid-cell-body">
                    <span v-if="slotGuestLine(cellSlot(court.id, hour))" class="canva-cal-grid-cell-label">{{ slotGuestLine(cellSlot(court.id, hour)) }}</span>
                    <span v-if="slotNoteLine(cellSlot(court.id, hour))" class="canva-cal-grid-cell-sub">{{ slotNoteLine(cellSlot(court.id, hour)) }}</span>
                  </span>
                  <span
                    v-if="cellSlot(court.id, hour)"
                    class="canva-cal-grid-check"
                    :class="[
                      cellSlot(court.id, hour)!.displayStatus === 'FREE' ? '' : 'canva-cal-grid-check-muted',
                      cellSlot(court.id, hour)!.displayStatus === 'FREE' && isSlotSelected(cellSlot(court.id, hour)!) ? 'canva-cal-grid-check-on' : '',
                    ]"
                    role="presentation"
                    @click="onCellCheckClick($event, cellSlot(court.id, hour))"
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
        v-if="calendarView === 'today' && selectedSlotIds.length"
        class="canva-selection-bar"
        role="region"
        :aria-label="t('owner.selectionBar.title')"
      >
        <div class="canva-selection-bar-inner">
          <div class="min-w-0 flex-1">
            <p class="text-xs font-bold text-brand-gray-600">{{ t('owner.selectionBar.title') }}</p>
            <p v-if="selectionCourt" class="mt-0.5 truncate text-sm font-bold text-brand-navy">
              {{ localizedField(selectionCourt, 'nameFa', 'nameEn') }} · {{ formattedDate }}
            </p>
            <div class="mt-2 flex gap-2 overflow-x-auto pb-0.5">
              <span
                v-for="slot in selectedSlotsFull"
                :key="slot.id"
                class="shrink-0 bg-brand-primary-soft px-2 py-0.5 text-xs font-bold text-brand-primary"
                style="border-radius: var(--sz-canva-radius);"
              >
                <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(slot.startTime, slot.endTime) }}</bdi>
              </span>
            </div>
          </div>
          <div class="flex shrink-0 flex-col gap-2 sm:flex-row">
            <button type="button" class="canva-gate-btn-primary" :disabled="!canBatchReserve" @click="openSelectionReserve">
              {{ t('owner.reserve') }}
            </button>
            <button type="button" class="canva-gate-btn-secondary" :disabled="!canBatchBlock" @click="openSelectionBlock">
              {{ t('owner.block') }}
            </button>
            <button type="button" class="canva-gate-btn-secondary" @click="clearSelection(); multiSelectMode = false">
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

    <AppModal :open="showMenu" patterned sheet :title="t('owner.slotActions')" max-width-class="canva-phone-shell" @close="closeMenu">
      <div class="venus-modal-shell">
        <!-- Menu only while choosing an action — hide once a form panel opens so fields stay above the keyboard -->
        <div v-if="!activePanel" class="space-y-1 !p-2">
          <div v-if="selectedSlot" class="mb-1 border-b border-brand-gray-100 px-3 py-3 text-sm" style="border-radius: var(--sz-canva-radius);">
            <p class="font-bold"><bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(selectedSlot.startTime, selectedSlot.endTime) }}</bdi></p>
            <p class="mt-1 font-bold text-brand-gray-600">{{ slotGuestName() || statusLabel(selectedSlot.displayStatus) }}</p>
            <p v-if="slotStatusSummary()" class="mt-1 text-xs font-bold text-brand-gray-600">{{ slotStatusSummary() }}</p>
            <div v-if="batchMode" class="mt-2 flex flex-wrap gap-1">
              <span
                v-for="slot in selectedSlotsFull"
                :key="slot.id"
                class="bg-brand-lavender px-2 py-0.5 text-xs font-bold text-brand-navy"
                style="border-radius: var(--sz-canva-radius);"
              >
                <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(slot.startTime, slot.endTime) }}</bdi>
              </span>
            </div>
          </div>

          <button v-if="canReserveSlot()" type="button" :class="menuItemClass('reserve')" @click="openReserveForm">
            <span class="canva-desk-action-icon"><AppIcon name="person_add" size="sm" /></span>
            <span class="min-w-0 flex-1 truncate">{{ reserveMenuLabel() }}</span>
          </button>
          <button v-if="canBlockSlot()" type="button" :class="menuItemClass('block')" @click="openBlockForm">
            <span class="canva-desk-action-icon"><AppIcon name="block" size="sm" /></span>
            <span class="min-w-0 flex-1 truncate">{{ t('owner.blockThisHour') }}</span>
          </button>
          <button type="button" :class="menuItemClass('comments')" @click="openCommentsForm">
            <span class="canva-desk-action-icon"><AppIcon name="add" size="sm" /></span>
            <span class="min-w-0 flex-1 truncate">{{ t('owner.addNote') }}</span>
          </button>
          <p v-if="actionError" class="venus-alert-error mx-2 mb-2">{{ actionError }}</p>
        </div>

        <div v-if="activePanel === 'detail'" class="venus-modal-panel !border-0">
          <div class="venus-modal-panel-body !pt-1">
            <div class="canva-detail-row">
              <span class="text-brand-gray-500">{{ t('owner.guestLabel') }}</span>
              <span class="max-w-[60%] text-start font-bold text-brand-navy">{{ slotGuestName() || '—' }}</span>
            </div>
            <div class="canva-detail-row">
              <span class="text-brand-gray-500">{{ t('owner.guestMobile') }}</span>
              <bdi dir="ltr" class="font-bold tabular-nums text-brand-navy">{{ selectedSlotFull?.booking?.guestMobile || '—' }}</bdi>
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

            <div v-if="batchMode || selectedSlotsFull.length > 1" class="mt-3 space-y-2">
              <label
                v-for="slot in selectedSlotsFull"
                :key="slot.id"
                class="flex items-center gap-2 bg-[#eceae6] px-3 py-2.5 text-xs font-bold text-brand-navy"
                style="border-radius: var(--sz-canva-radius);"
              >
                <input
                  type="checkbox"
                  class="canva-settings-checkbox"
                  :checked="isSlotSelected(slot)"
                  @change="toggleFreeSlot(slot)"
                >
                <span class="min-w-0 flex-1 truncate text-start">{{ slotGuestName() || statusLabel(slot.displayStatus) }}</span>
                <bdi dir="ltr" class="tabular-nums">{{ formatTimeLabel(slot.startTime) }}</bdi>
              </label>
            </div>

            <!-- Canva (14): cancel + add note only — edit stays reachable via reserve flow, not on this sheet -->
            <div class="canva-detail-actions">
              <button type="button" class="canva-detail-cancel" @click="openCancelForm">
                {{ t('owner.cancelBooking') }}
              </button>
              <button type="button" class="canva-detail-note" @click="openCommentsForm">
                <AppIcon name="add" size="sm" />
                {{ t('owner.addNote') }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="activePanel === 'cancel'" class="venus-modal-panel">
          <div class="venus-modal-panel-header">
            <div class="flex items-center gap-2">
              <button type="button" class="btn-ghost px-2 py-1 text-xs" @click="activePanel = canCancelSlot() ? 'detail' : null">
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
            <button type="button" class="canva-gate-btn-primary" :disabled="!cancelReason || saving" @click="doCancel">{{ t('owner.cancelBooking') }}</button>
            <button type="button" class="canva-gate-btn-secondary" @click="activePanel = canCancelSlot() ? 'detail' : null">{{ t('common.back') }}</button>
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
            <p v-if="selectedSlot" class="mt-1 text-xs font-bold text-brand-gray-600">
              <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(selectedSlot.startTime, selectedSlot.endTime) }}</bdi>
            </p>
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
                  :aria-expanded="guestSearchOpen"
                  aria-autocomplete="list"
                  aria-controls="owner-reserve-guest-suggestions"
                  :placeholder="t('owner.guestSearchHint')"
                  @input="onGuestFullNameInput"
                  @focus="onGuestFullNameInput"
                  @blur="closeGuestSearchSoon"
                >
                <div
                  v-if="guestSearchOpen && (guestSuggestions.length || guestSearchPending)"
                  id="owner-reserve-guest-suggestions"
                  class="absolute inset-x-0 top-full z-20 mt-1 max-h-48 overflow-y-auto border border-brand-gray-200 bg-white shadow-sm"
                  style="border-radius: 2px;"
                  role="listbox"
                >
                  <p v-if="guestSearchPending && !guestSuggestions.length" class="px-3 py-2 text-xs text-brand-gray-500">
                    {{ t('common.loading') }}
                  </p>
                  <button
                    v-for="(guest, idx) in guestSuggestions"
                    :key="`${guest.mobile}-${guest.name}-${idx}`"
                    type="button"
                    class="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-brand-primary-soft"
                    role="option"
                    @mousedown.prevent="selectGuestSuggestion(guest)"
                  >
                    <span class="min-w-0 truncate font-bold text-brand-navy">{{ guest.name || '—' }}</span>
                    <bdi v-if="guest.mobile" dir="ltr" class="shrink-0 tabular-nums text-xs text-brand-gray-600">{{ guest.mobile }}</bdi>
                  </button>
                </div>
              </div>
            </AppFormField>
            <AppFormField :label="t('owner.guestMobile')" required field-id="owner-reserve-guest-mobile">
              <input
                id="owner-reserve-guest-mobile"
                v-model="form.guestMobile"
                dir="ltr"
                class="neo-input tabular-nums"
                autocomplete="tel"
                inputmode="tel"
                required
                :aria-required="true"
                :placeholder="t('owner.guestMobile')"
              >
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
                        :disabled="equipmentQty(item.id) >= equipmentStock(item)"
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
            <p v-if="isNewReservation() && slotsForReserve().some(slotIsInPast)" class="text-xs font-medium text-red-600">{{ t('owner.errors.slotInPast') }}</p>
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
            <button type="button" class="canva-gate-btn-secondary" @click="activePanel = isEditingBooking() ? 'detail' : null">{{ t('common.back') }}</button>
          </div>
        </div>

        <div v-if="activePanel === 'payConfirm'" class="venus-modal-panel !border-0">
          <div class="canva-desk-pay px-1 pb-2">
            <div class="canva-auth-header">
              <NuxtLink :to="localePath('/')" class="flex items-center gap-2" :aria-label="t('brand.name')">
                <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7" />
                <InboxWordmark class="text-base text-brand-navy" />
              </NuxtLink>
              <button type="button" class="text-xs font-bold text-brand-gray-600" @click="activePanel = 'reserve'">
                {{ t('common.close') }}
              </button>
            </div>
            <div class="text-center">
              <p class="text-sm font-bold text-brand-navy">{{ t('owner.deskConfirmTitle') }}</p>
              <h2 class="mt-1 text-xl font-bold text-brand-navy">{{ clubCalendarTitle }}</h2>
            </div>
            <div class="mt-3 text-start">
              <p class="canva-confirm-book-date">{{ payConfirmDateHeading }}</p>
              <div class="mt-2 flex flex-wrap justify-start gap-2">
                <span
                  v-for="slot in slotsForReserve()"
                  :key="slot.id"
                  class="canva-confirm-book-time"
                >
                  {{ slot.startTime?.slice(0, 5) }}
                </span>
              </div>
              <p v-if="payConfirmCourt" class="mt-2 flex items-center justify-start gap-2 text-xs font-bold text-brand-navy">
                <span class="canva-confirm-book-dot" aria-hidden="true" />
                {{ localizedField(payConfirmCourt, 'nameFa', 'nameEn') }}
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
                <p v-if="deskDiscountError" class="canva-confirm-book-discount-note text-brand-primary">{{ deskDiscountError }}</p>
              </div>
              <div class="canva-confirm-book-cost-row">
                <span class="canva-confirm-book-cost-label">{{ t('booking.discountCode') }}</span>
                <span class="canva-confirm-book-cost-amount" dir="ltr">{{ formatNumber(payConfirmDiscountAmount) }}</span>
              </div>
              <div class="canva-confirm-book-cost-row font-bold text-brand-navy">
                <span>{{ t('owner.priceBreakdown.total') }}</span>
                <span dir="ltr">{{ formatCurrency(payConfirmTotal) }}</span>
              </div>
            </div>
            <p class="mt-3 text-center text-[11px] text-brand-gray-500">{{ t('booking.acceptTerms') }}</p>
            <p v-if="actionError" class="venus-alert-error mt-3">{{ actionError }}</p>
            <div class="mt-4 flex flex-col gap-2">
              <button
                type="button"
                class="canva-gate-btn-primary w-full"
                :disabled="saving"
                @click="confirmDeskPay('link')"
              >
                {{ saving ? t('common.loading') : t('owner.sendPayLink') }}
              </button>
              <button
                type="button"
                class="canva-gate-btn-secondary w-full"
                :disabled="saving"
                @click="confirmDeskPay('cash')"
              >
                {{ t('owner.payCash') }}
              </button>
            </div>
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
            <button type="button" class="canva-gate-btn-secondary" @click="activePanel = null">{{ t('common.back') }}</button>
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
            <button v-if="selectedSlot?.booking || canReserveSlot()" type="button" class="canva-gate-btn-primary" :disabled="saving || (isNewReservation() && !guestFieldsValid())" @click="doReserve">{{ saving ? t('common.loading') : t('owner.confirmNote') }}</button>
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
  padding-bottom: calc(9rem + var(--sz-tab-bar-height) + var(--sz-safe-bottom));
}

@media (min-width: 1024px) {
  .calendar-selection-bar {
    inset-inline-start: 290px;
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
    padding-bottom: 6rem;
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
  background: #eceae6;
  color: #4a4a46;
}

:deep(.canva-cal-grid-cell.slot-reserved),
:deep(.canva-cal-grid-cell.slot-public),
:deep(.canva-cal-grid-cell.slot-team) {
  background: #f3d4d4;
  color: #2c2c2a;
}

:deep(.canva-cal-grid-cell.slot-pending) {
  background: #eceae6;
  color: #2c2c2a;
}

:deep(.canva-cal-grid-cell.slot-cancel) {
  background: #eceae6;
  color: #4a4a46;
}

:deep(.canva-cal-grid-cell.slot-closed),
:deep(.canva-cal-grid-cell.slot-blocked) {
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
