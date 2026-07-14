<script setup lang="ts">
import { palette } from '#shared/palette.ts'
import { isPastDate, isSlotStartInPast } from '#shared/localDate.ts'
import {
  countRecurringSessionsByDayInRange,
  ensureDayTimesForDays,
  hasValidDayTimes,
  weekdayNameFromDate,
  type DayTimeRange,
} from '#shared/recurringSessions.ts'
import { buildHourlyOptions } from '#shared/courtFacilities.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

interface OwnerCalendarBookingEquipment {
  equipmentId: string
  priceAtBooking: number
  equipment?: { id: string; nameFa: string; nameEn: string; price: number; category: string } | null
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

type ActivePanel = 'cancel' | 'reserve' | 'season' | 'package' | 'comments' | 'equipment' | null

const { t, locale } = useI18n()
const { localizedField } = useLocalizedField()
const { formatDate, formatDayNumber, formatWeekday, formatMonth, formatTimeRange, formatNumber, formatCurrency } = useFormatters()
const { today } = useLocalDate()

const date = ref(today())
const showDatePicker = ref(false)
const datePickerRef = ref<HTMLElement | null>(null)
const selectedSlot = ref<OwnerCalendarSlot | null>(null)
const selectedSlotIds = ref<string[]>([])
const selectionCourtId = ref<string | null>(null)
const showMenu = ref(false)
const activePanel = ref<ActivePanel>(null)
const cancelReason = ref('')
const saving = ref(false)
const actionError = ref('')

const weekdayOptions = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const form = reactive({
  guestName: '',
  guestFamily: '',
  guestMobile: '',
  paymentMethod: 'CASH',
  paymentStatus: 'PAY_AT_CLUB',
  comments: '',
  equipmentIds: [] as string[],
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

const hours = computed(() => {
  const set = new Set<string>()
  data.value?.slots?.forEach((s: { startTime: string }) => set.add(s.startTime))
  return [...set].sort()
})

const courts = computed(() => data.value?.courts || [])
const scheduleTimeOptions = computed(() => {
  const court = courts.value.find((item: { id: string }) => item.id === selectedSlotFull.value?.courtId)
  const open = court?.effectiveOpenHour ?? data.value?.clubOpenHour ?? 8
  const close = court?.effectiveCloseHour ?? data.value?.clubCloseHour ?? 22
  const step = data.value?.sessionDurationMinutes ?? 60
  return buildHourlyOptions(open, close, step)
})
const formattedDate = computed(() => formatDate(`${date.value}T12:00:00`))
const currentDate = computed(() => new Date(`${date.value}T12:00:00`))
const clubCoaches = computed(() =>
  (staffData.value?.staff || [])
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
const batchMode = computed(() => selectedSlotIds.value.length > 1 && showMenu.value)
const canBatchReserve = computed(() =>
  selectedSlotsFull.value.length > 0
    && selectedSlotsFull.value.every((slot) => slot.displayStatus === 'FREE')
    && !selectedSlotsFull.value.some(slotIsInPast),
)
const canBatchCancel = computed(() =>
  selectedSlotsFull.value.length > 0 && selectedSlotsFull.value.every((slot) => Boolean(slot.booking)),
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
  }
  return map[status] || 'slot-free'
}

function statusLabel(status: string) {
  return t(`owner.status.${status}`)
}

function cellSlot(courtId: string, hour: string) {
  return data.value?.slots?.find((s: OwnerCalendarSlot) => s.courtId === courtId && s.startTime === hour)
}

function slotLabel(slot: OwnerCalendarSlot | null | undefined) {
  if (!slot) return ''

  if (slot.displayStatus === 'FREE')
    return t('owner.status.FREE')

  const fullName = [slot.booking?.guestName, slot.booking?.guestFamily].filter(Boolean).join(' ').trim()
  return fullName || statusLabel(slot.displayStatus)
}

function slotMeta(slot: OwnerCalendarSlot | null | undefined) {
  if (!slot || slot.displayStatus === 'FREE')
    return ''

  if (slot.booking?.guestMobile)
    return slot.booking.guestMobile

  if (slot.booking?.paymentStatus)
    return t(`booking.paymentStatus.${slot.booking.paymentStatus}`)

  return ''
}

function resetPanels() {
  activePanel.value = null
}

function defaultPanelForSlot(slot: OwnerCalendarSlot): ActivePanel {
  if (slot.displayStatus === 'CLOSED') return 'comments'
  return 'reserve'
}

function menuButtonClass(panel: ActivePanel) {
  const base = 'neo-menu-item'
  return activePanel.value === panel ? `${base} neo-menu-item-active` : base
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

function sumEquipmentIds(ids: string[]) {
  return (equipments.value || [])
    .filter((item: { id: string }) => ids.includes(item.id))
    .reduce((sum: number, item: { category: string; price: number }) => sum + equipmentPriceForItem(item), 0)
}

function equipmentOptionLabel(item: { nameFa: string; nameEn: string; category: string; price: number }) {
  const name = localizedField(item, 'nameFa', 'nameEn')
  if (item.category === 'CLUB' || !item.price) return `${name} (${t('owner.free')})`
  return `${name} — ${formatCurrency(item.price)}`
}

const reserveEquipmentPrice = computed(() => {
  const base = sumEquipmentIds(form.equipmentIds)
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
  const fullSlot = (data.value?.slots?.find((s: { id: string }) => s.id === slot.id) || slot) as OwnerCalendarSlot
  if (fullSlot.displayStatus !== 'FREE') {
    clearSelection()
    openSlot(fullSlot)
    return
  }
  toggleFreeSlot(fullSlot)
}

function openSelectionReserve() {
  if (!canBatchReserve.value || !selectedSlotsFull.value.length) return
  openSlot(selectedSlotsFull.value[0], { keepSelection: true })
  activePanel.value = 'reserve'
}

function openSelectionCancel() {
  if (!canBatchCancel.value || !selectedSlotsFull.value.length) return
  openSlot(selectedSlotsFull.value[0], { keepSelection: true })
  activePanel.value = 'cancel'
}

function openSlot(slot: OwnerCalendarSlot | null | undefined, opts?: { keepSelection?: boolean }) {
  if (!slot) return
  const fullSlot = (data.value?.slots?.find((s: { id: string }) => s.id === slot.id) || slot) as OwnerCalendarSlot
  if (!opts?.keepSelection) clearSelection()
  selectedSlot.value = fullSlot
  showMenu.value = true
  resetPanels()
  activePanel.value = defaultPanelForSlot(fullSlot)
  cancelReason.value = ''
  actionError.value = ''
  const isFree = fullSlot.displayStatus === 'FREE'
  form.guestName = isFree ? '' : (fullSlot.booking?.guestName || '')
  form.guestFamily = isFree ? '' : (fullSlot.booking?.guestFamily || '')
  form.guestMobile = isFree ? '' : (fullSlot.booking?.guestMobile || '')
  form.paymentMethod = isFree ? 'CASH' : (fullSlot.booking?.payment?.method || fullSlot.booking?.paymentMethod || 'CASH')
  form.paymentStatus = isFree ? 'PAY_AT_CLUB' : (fullSlot.booking?.payment?.status || fullSlot.booking?.paymentStatus || 'PAY_AT_CLUB')
  form.comments = isFree ? '' : (fullSlot.booking?.comments || '')
  form.displayStatus = isFree ? 'RESERVED' : fullSlot.displayStatus
  const equipmentIds = isFree ? [] : (fullSlot.booking?.bookingEquipments?.map((item) => item.equipmentId) || [])
  form.equipmentIds = equipmentIds
  const defaultRange = defaultDayRange(fullSlot)
  const anchorDay = weekdayNameFromDate(fullSlot.date)
  seasonForm.startDate = ''
  seasonForm.finishDate = ''
  seasonForm.days = [anchorDay]
  seasonForm.dayTimes = ensureDayTimesForDays({}, [anchorDay], defaultRange)
  seasonForm.equipmentId = equipmentIds[0] || ''
  seasonForm.comments = fullSlot.booking?.comments || ''
  packageForm.coachId = fullSlot.booking?.coachId || ''
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
  activePanel.value = 'cancel'
}

function openCommentsForm() {
  activePanel.value = 'comments'
}

function openSeasonForm() {
  activePanel.value = 'season'
}

function openPackageForm() {
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
  clearSelection()
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

async function doReserve() {
  const targets = slotsForReserve()
  if (!targets.length || saving.value || !canSubmitReserve()) return
  saving.value = true
  actionError.value = ''
  try {
    for (const slot of targets) {
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
          displayStatus: slot.displayStatus === 'FREE' ? 'RESERVED' : reserveDisplayStatus(),
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

async function doCancel() {
  const targets = slotsForCancel()
  if (!targets.length || !cancelReason.value || saving.value) return
  saving.value = true
  actionError.value = ''
  try {
    for (const slot of targets) {
      await $fetch('/api/owner/cancel', {
        method: 'POST',
        body: { slotId: slot.id, reason: cancelReason.value },
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

async function doSeasonReserve() {
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
        coachId: packageForm.coachId,
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
  return isEditingBooking() ? t('owner.editBookingTitle') : t('owner.reserve')
}

function canCancelSlot() {
  return Boolean(selectedSlot.value?.booking)
}

function canReserveSlot() {
  return selectedSlot.value?.displayStatus !== 'CLOSED'
}

function slotStatusSummary() {
  if (!selectedSlot.value) return ''
  if (selectedSlot.value.booking?.paymentStatus) {
    return t(`booking.paymentStatus.${selectedSlot.value.booking.paymentStatus}`)
  }
  if (selectedSlot.value.booking?.guestMobile) {
    return selectedSlot.value.booking.guestMobile
  }
  return ''
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
  return Boolean(form.guestName.trim() && form.guestFamily.trim() && form.guestMobile.trim())
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
  { status: 'TEAM', color: palette.slotDisplay.TEAM },
  { status: 'PUBLIC', color: palette.slotDisplay.PUBLIC },
  { status: 'RESERVED', color: palette.slotDisplay.RESERVED },
  { status: 'FREE', color: palette.slotDisplay.FREE },
  { status: 'CANCELLED', color: palette.slotDisplay.CANCELLED },
  { status: 'PENDING', color: palette.slotDisplay.PENDING },
  { status: 'CLOSED', color: palette.slotDisplay.CLOSED },
]
</script>

<template>
  <div class="tail-page-stack" :class="{ 'calendar-page-has-selection': selectedSlotIds.length }">
    <AppAsyncState :pending="pending" :error="error" skeleton-variant="calendar">
    <section class="calendar-shell overflow-hidden rounded-tail-lg border border-brand-gray-200 bg-white shadow-venus-sm" :class="locale === 'en' ? 'calendar-latin' : ''">
      <div class="border-b border-brand-gray-100 px-5 py-5 sm:px-7">
        <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p class="mb-1 text-xs font-bold text-brand-gray-600" :class="locale === 'en' ? 'tracking-[0.24em]' : ''">{{ t('owner.dashboardEyebrow') }}</p>
            <h1 class="font-display text-2xl font-bold text-brand-navy">{{ t('owner.calendar') }}</h1>
            <p class="mt-1 text-sm font-bold text-brand-gray-600">{{ t('owner.calendarSubtitle', { date: formattedDate }) }}</p>
          </div>
        </div>

        <div class="mt-5 flex" :class="locale === 'fa' ? 'justify-start' : 'justify-end'">
          <div ref="datePickerRef" class="relative">
            <button
              type="button"
              class="calendar-toolbar-pill font-bold text-brand-navy"
              :aria-expanded="showDatePicker"
              @click.stop="showDatePicker = !showDatePicker"
            >
              <span>{{ weekdayLabel }}</span>
              <bdi dir="ltr" class="tabular-nums">{{ dayNumber }}</bdi>
              <span>{{ monthLabel }}</span>
            </button>

            <div v-if="showDatePicker" class="absolute z-20 mt-2" :class="locale === 'fa' ? 'start-0' : 'end-0'">
              <AppJalaliCalendar
                v-if="locale === 'fa'"
                v-model="date"
                @select="closeDatePicker"
              />
              <label v-else class="ios-card block p-4">
                <span class="mb-2 block text-sm font-bold text-brand-navy">{{ t('common.date') }}</span>
                <input
                  v-model="date"
                  type="date"
                  dir="ltr"
                  class="neo-input tabular-nums"
                  @change="closeDatePicker"
                >
              </label>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!courts.length" class="px-5 py-8 text-center text-sm font-bold text-brand-gray-600">
        {{ t('common.empty') }}
      </div>

      <div v-else class="overflow-x-auto px-3 pb-3 pt-4 sm:px-5 sm:pb-5">
        <div class="min-w-[900px]">
          <div class="grid calendar-grid border-b border-brand-gray-100 pb-3">
            <div />
            <div
              v-for="court in courts"
              :key="court.id"
              class="calendar-column-head"
            >
              <span class="calendar-column-day">{{ weekdayLabel }}</span>
              <span class="calendar-column-title">{{ localizedField(court, 'nameFa', 'nameEn') }}</span>
            </div>
          </div>

          <div
            v-for="hour in hours"
            :key="hour"
            class="grid calendar-grid"
          >
            <div class="calendar-time-cell">
              <bdi dir="ltr" class="calendar-time tabular-nums">{{ formatTimeRange(hour) }}</bdi>
            </div>

            <div
              v-for="court in courts"
              :key="`${court.id}-${hour}`"
              class="calendar-slot-cell"
            >
              <button
                v-if="cellSlot(court.id, hour)"
                type="button"
                :class="slotButtonClass(cellSlot(court.id, hour)!)"
                @click="handleSlotClick(cellSlot(court.id, hour))"
              >
                <bdi dir="ltr" class="calendar-slot-time tabular-nums">{{ formatTimeRange(cellSlot(court.id, hour)!.startTime, cellSlot(court.id, hour)!.endTime) }}</bdi>
                <span class="calendar-slot-title">{{ slotLabel(cellSlot(court.id, hour)) }}</span>
                <bdi v-if="slotMeta(cellSlot(court.id, hour))" dir="ltr" class="calendar-slot-meta tabular-nums">{{ slotMeta(cellSlot(court.id, hour)) }}</bdi>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <div
        v-if="selectedSlotIds.length"
        class="calendar-selection-bar"
        role="region"
        :aria-label="t('owner.selectionBar.title')"
      >
        <div class="calendar-selection-bar-inner">
          <div class="min-w-0 flex-1">
            <p class="text-xs font-bold text-brand-gray-600">{{ t('owner.selectionBar.title') }}</p>
            <p v-if="selectionCourt" class="mt-0.5 truncate text-sm font-bold text-brand-navy">
              {{ localizedField(selectionCourt, 'nameFa', 'nameEn') }} · {{ formattedDate }}
            </p>
            <div class="mt-2 flex gap-2 overflow-x-auto pb-0.5">
              <span
                v-for="slot in selectedSlotsFull"
                :key="slot.id"
                class="neo-badge shrink-0 bg-brand-lavender text-brand-navy"
              >
                <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(slot.startTime, slot.endTime) }}</bdi>
              </span>
            </div>
          </div>
          <div class="calendar-selection-bar-actions">
            <button type="button" class="btn-primary" :disabled="!canBatchReserve" @click="openSelectionReserve">
              {{ t('owner.reserve') }}
            </button>
            <button type="button" class="btn-ghost" :disabled="!canBatchCancel" @click="openSelectionCancel">
              {{ t('owner.cancel') }}
            </button>
            <button type="button" class="btn-ghost" @click="clearSelection">
              {{ t('owner.selectionBar.clear') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <aside class="tail-card-grid-2 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div class="ios-card p-5">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h2 class="text-base font-bold text-brand-navy">{{ t('owner.legend') }}</h2>
            <p class="mt-1 text-sm font-bold text-brand-gray-600">{{ t('owner.legendHint') }}</p>
          </div>
          <span class="neo-badge">{{ t('common.courtsCount', { count: formatNumber(courts.length) }) }}</span>
        </div>
        <div class="mt-4 flex flex-wrap gap-3">
          <div v-for="item in legend" :key="item.status" class="calendar-legend-item">
            <span class="calendar-legend-dot" :style="{ background: item.color }" />
            {{ statusLabel(item.status) }}
          </div>
        </div>
      </div>

      <div class="venus-widget-card-accent p-5">
        <h2 class="text-base font-bold text-brand-navy">{{ t('owner.quickNotes') }}</h2>
        <p class="mt-2 text-sm font-bold leading-6 text-brand-gray-600">
          {{ t('owner.quickNotesBody') }}
        </p>
      </div>
    </aside>

    <AppModal :open="showMenu" :title="t('owner.slotActions')" max-width-class="max-w-4xl" @close="closeMenu">
      <div class="venus-modal-shell">
        <div class="neo-modal-menu venus-modal-menu" :class="{ 'max-lg:hidden': activePanel }">
          <div v-if="selectedSlot" class="border-b border-brand-gray-100 px-4 py-3 text-sm">
            <p class="font-bold"><bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(selectedSlot.startTime, selectedSlot.endTime) }}</bdi></p>
            <p class="mt-1 font-bold text-brand-gray-600">{{ slotGuestName() || statusLabel(selectedSlot.displayStatus) }}</p>
            <p v-if="slotStatusSummary()" class="mt-1 text-xs font-bold text-brand-gray-600">{{ slotStatusSummary() }}</p>
            <div v-if="batchMode" class="mt-2 flex flex-wrap gap-1">
              <span
                v-for="slot in selectedSlotsFull"
                :key="slot.id"
                class="rounded bg-brand-lavender px-2 py-0.5 text-xs font-bold text-brand-navy"
              >
                <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(slot.startTime, slot.endTime) }}</bdi>
              </span>
            </div>
          </div>
          <button v-if="canCancelSlot()" type="button" :class="menuButtonClass('cancel')" @click="openCancelForm">{{ t('owner.cancel') }}</button>
          <button v-if="canReserveSlot()" type="button" :class="menuButtonClass('reserve')" @click="openReserveForm">{{ reserveMenuLabel() }}</button>
          <button v-if="canReserveSlot()" type="button" :class="menuButtonClass('season')" @click="openSeasonForm">{{ t('owner.seasonReserve') }}</button>
          <button v-if="canReserveSlot()" type="button" :class="menuButtonClass('package')" @click="openPackageForm">{{ t('owner.reserveWithCoach') }}</button>
          <button type="button" :class="menuButtonClass('comments')" @click="openCommentsForm">{{ t('owner.comments') }}</button>
          <button type="button" :class="menuButtonClass('equipment')" @click="openEquipmentForm">{{ t('owner.equipments') }}</button>
          <button type="button" class="neo-menu-item border-b-0" @click="closeMenu">{{ t('common.close') }}</button>
        </div>

        <div v-if="activePanel === 'cancel'" class="venus-modal-panel">
          <div class="venus-modal-panel-header">
            <div class="flex items-center gap-2">
              <button type="button" class="btn-ghost px-2 py-1 text-xs lg:hidden" @click="backToMenu">
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
            <AppFormField :label="t('owner.cancelReasonPlaceholder')">
              <select v-model="cancelReason" class="neo-select">
                <option value="">{{ t('owner.cancelReasonPlaceholder') }}</option>
                <option v-for="reason in cancelReasons" :key="reason" :value="reason">{{ t(`owner.cancelReasons.${reason}`) }}</option>
              </select>
            </AppFormField>
          </div>
          <div class="venus-modal-footer">
            <p v-if="actionError" class="venus-alert-error">{{ actionError }}</p>
            <div class="flex gap-3">
              <button type="button" class="btn-primary flex-1" :disabled="!cancelReason || saving" @click="doCancel">{{ t('owner.cancel') }}</button>
              <button type="button" class="btn-ghost flex-1" @click="activePanel = null">{{ t('common.back') }}</button>
            </div>
          </div>
        </div>

        <div v-if="activePanel === 'reserve'" class="venus-modal-panel">
          <div class="venus-modal-panel-header">
            <div class="flex items-center gap-2">
              <button type="button" class="btn-ghost px-2 py-1 text-xs lg:hidden" @click="backToMenu">
                <span class="inline-flex items-center gap-1">
                  <AppIcon name="arrow_back" size="sm" />
                  {{ t('common.back') }}
                </span>
              </button>
              <h3 class="font-bold text-brand-navy">{{ reserveFormTitle() }}</h3>
            </div>
          </div>
          <form class="venus-modal-panel-body venus-form-stack" @submit.prevent="doReserve">
            <p v-if="selectedSlotFull && selectedSlotFull.displayStatus !== 'FREE'" class="rounded-venus bg-brand-lavender px-3 py-2 text-xs font-bold text-brand-navy">
              <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(selectedSlotFull.startTime, selectedSlotFull.endTime) }}</bdi>
              · {{ statusLabel(selectedSlotFull.displayStatus) }}
            </p>
            <div class="venus-form-grid">
              <AppFormField :label="t('owner.guestName')" required field-id="owner-reserve-guest-name">
                <input
                  id="owner-reserve-guest-name"
                  v-model="form.guestName"
                  class="neo-input"
                  autocomplete="given-name"
                  required
                  :aria-required="true"
                >
              </AppFormField>
              <AppFormField :label="t('owner.guestFamily')" required field-id="owner-reserve-guest-family">
                <input
                  id="owner-reserve-guest-family"
                  v-model="form.guestFamily"
                  class="neo-input"
                  autocomplete="family-name"
                  required
                  :aria-required="true"
                >
              </AppFormField>
            </div>
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
              >
            </AppFormField>
            <AppFormField v-if="isEditingBooking()" :label="t('owner.slotStatusLabel')" field-id="owner-reserve-slot-status">
              <select id="owner-reserve-slot-status" v-model="form.displayStatus" class="neo-select">
                <option v-for="status in editableSlotStatuses" :key="status" :value="status">
                  {{ statusLabel(status) }}
                </option>
              </select>
            </AppFormField>
            <AppFormField :label="t('owner.paymentMethod')" field-id="owner-reserve-payment-method">
              <select id="owner-reserve-payment-method" v-model="form.paymentMethod" class="neo-select">
                <option value="IPG">{{ t('owner.paymentMethods.IPG') }}</option>
                <option value="CASH">{{ t('owner.paymentMethods.CASH') }}</option>
              </select>
            </AppFormField>
            <AppFormField :label="t('owner.paymentStatusLabel')" field-id="owner-reserve-payment-status">
              <select id="owner-reserve-payment-status" v-model="form.paymentStatus" class="neo-select">
                <option value="PAY_AT_CLUB">{{ t('booking.paymentStatus.PAY_AT_CLUB') }}</option>
                <option value="PAID">{{ t('booking.paymentStatus.PAID') }}</option>
              </select>
            </AppFormField>
            <AppFormField :label="t('owner.equipmentsPage.selectForBooking')" field-id="owner-reserve-equipment">
              <OwnerEquipmentPicker
                v-model="form.equipmentIds"
                :options="equipmentPickerOptions"
                :aria-labelledby="'owner-reserve-equipment-label'"
              />
            </AppFormField>
            <AppFormField :label="t('owner.comments')" field-id="owner-reserve-comments">
              <textarea id="owner-reserve-comments" v-model="form.comments" class="neo-textarea" rows="3" />
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
            <button type="button" class="btn-primary w-full" :disabled="!canSubmitReserve()" @click="doReserve">{{ saving ? t('common.loading') : confirmReserveLabel() }}</button>
            <button
              v-if="isEditingBooking() && canCancelSlot()"
              type="button"
              class="btn-ghost w-full"
              @click="openCancelForm"
            >
              {{ t('owner.cancelBooking') }}
            </button>
          </div>
        </div>

        <div v-if="activePanel === 'comments'" class="venus-modal-panel">
          <div class="venus-modal-panel-header">
            <div class="flex items-center gap-2">
              <button type="button" class="btn-ghost px-2 py-1 text-xs lg:hidden" @click="backToMenu">
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
            <button v-if="selectedSlot?.booking || canReserveSlot()" type="button" class="btn-primary w-full" :disabled="saving || (isNewReservation() && !guestFieldsValid())" @click="doReserve">{{ saving ? t('common.loading') : t('common.save') }}</button>
          </div>
        </div>

        <div v-if="activePanel === 'season'" class="venus-modal-panel">
          <div class="venus-modal-panel-header">
            <div class="flex items-center gap-2">
              <button type="button" class="btn-ghost px-2 py-1 text-xs lg:hidden" @click="backToMenu">
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
                      class="neo-pill"
                      :class="seasonForm.days.includes(day) ? 'neo-pill-active' : 'neo-pill-inactive'"
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
            <p v-if="seasonSessionLabel" class="mt-4 rounded-venus bg-brand-lavender px-4 py-3 text-sm font-bold text-brand-navy">
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
            <button type="button" class="btn-primary w-full" :disabled="saving || !seasonForm.days.length || !seasonScheduleValid() || !seasonDatesValid || !guestFieldsValid()" @click="doSeasonReserve">{{ saving ? t('common.loading') : t('common.save') }}</button>
          </div>
        </div>

        <div v-if="activePanel === 'package'" class="venus-modal-panel">
          <div class="venus-modal-panel-header">
            <div class="flex items-center gap-2">
              <button type="button" class="btn-ghost px-2 py-1 text-xs lg:hidden" @click="backToMenu">
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
                <AppFormField :label="t('owner.packagePage.coachPlaceholder')">
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
                      class="neo-pill"
                      :class="packageForm.days.includes(day) ? 'neo-pill-active' : 'neo-pill-inactive'"
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
            <p v-if="packageSessionLabel" class="mt-4 rounded-venus bg-brand-lavender px-4 py-3 text-sm font-bold text-brand-navy">
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
            <button type="button" class="btn-primary w-full" :disabled="saving || !packageForm.days.length || !packageScheduleValid() || !packageDatesValid.value || !guestFieldsValid()" @click="doPackageReserve">{{ saving ? t('common.loading') : t('common.save') }}</button>
          </div>
        </div>

        <div v-if="activePanel === 'equipment'" class="venus-modal-panel">
          <div class="venus-modal-panel-header">
            <div class="flex items-center gap-2">
              <button type="button" class="btn-ghost px-2 py-1 text-xs lg:hidden" @click="backToMenu">
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
              <OwnerEquipmentPicker v-model="form.equipmentIds" :options="equipmentPickerOptions" />
            </AppFormField>
          </div>
          <div class="venus-modal-footer">
            <OwnerBookingPriceSummary
              :court-price="courtPrice"
              :equipment-price="reserveEquipmentPrice"
            />
            <p v-if="actionError" class="venus-alert-error">{{ actionError }}</p>
            <button type="button" class="btn-primary w-full" :disabled="saving" @click="saveEquipmentSelection">{{ saving ? t('common.loading') : t('common.save') }}</button>
          </div>
        </div>
      </div>
    </AppModal>
    </AppAsyncState>
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

:deep(.slot-free) {
  background: var(--sz-slot-free);
  color: var(--sz-secondary);
}

:deep(.slot-reserved) {
  background: var(--sz-slot-reserved);
  color: #fff;
}

:deep(.slot-public) {
  background: var(--sz-slot-public);
  color: var(--sz-navy);
}

:deep(.slot-team) {
  background: var(--sz-slot-team);
  color: #fff;
}

:deep(.slot-pending) {
  background: var(--sz-slot-pending);
  color: #fff;
}

:deep(.slot-cancel) {
  background: var(--sz-slot-cancel);
  color: var(--sz-secondary);
}

:deep(.slot-closed) {
  background: var(--sz-slot-closed);
  color: #fff;
}

@media (max-width: 640px) {
  .calendar-time-cell,
  .calendar-slot-cell {
    min-height: 6.25rem;
  }
}
</style>
