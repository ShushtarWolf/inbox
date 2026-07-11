<script setup lang="ts">
import { palette } from '#shared/palette.ts'

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

const DAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

const { t, locale } = useI18n()
const { localizedField } = useLocalizedField()
const { formatDate, formatDayNumber, formatWeekday, formatMonth, formatTimeRange, formatNumber, formatCurrency } = useFormatters()
const { today } = useLocalDate()

const date = ref(today())
const showDatePicker = ref(false)
const datePickerRef = ref<HTMLElement | null>(null)
const selectedSlot = ref<OwnerCalendarSlot | null>(null)
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
})

const seasonForm = reactive({
  days: ['Sun'] as string[],
  times: ['12:00'],
  equipmentId: '',
  comments: '',
})

const packageForm = reactive({
  coachId: '',
  days: ['Sun'] as string[],
  times: ['12:00'],
  equipmentId: '',
  comments: '',
})

const { data: equipments } = await useAuthedFetch('/api/owner/equipments')
const { data: staffData } = await useAuthedFetch('/api/owner/staff')

const { data, pending, error, refresh } = await useAuthedFetch('/api/owner/calendar', {
  query: computed(() => ({ date: date.value })),
})

useOwnerClubRefresh(refresh)

watch(date, () => refresh())

const hours = computed(() => {
  const set = new Set<string>()
  data.value?.slots?.forEach((s: { startTime: string }) => set.add(s.startTime))
  return [...set].sort()
})

const courts = computed(() => data.value?.courts || [])
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
const courtPrice = computed(() => selectedSlotFull.value?.price ?? 0)
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
  if (slot.booking) return 'reserve'
  return 'reserve'
}

function menuButtonClass(panel: ActivePanel) {
  const base = 'neo-menu-item'
  return activePanel.value === panel ? `${base} neo-menu-item-active` : base
}

function countRecurringSessions(days: string[], times: string[], anchorDate?: string, weeks = 8) {
  const wanted = new Set(days.map((day) => DAY_MAP[day]).filter((value) => value !== undefined))
  if (!wanted.size || !times.length) return 0
  const anchor = anchorDate || date.value
  const start = new Date(`${anchor}T12:00:00Z`)
  let dateCount = 0
  for (let offset = 0; offset < weeks * 7; offset += 1) {
    const day = new Date(start)
    day.setUTCDate(start.getUTCDate() + offset)
    if (wanted.has(day.getUTCDay())) dateCount += 1
  }
  return dateCount * times.length
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

const reserveEquipmentPrice = computed(() => sumEquipmentIds(form.equipmentIds))
const seasonEquipmentPrice = computed(() => sumEquipmentIds(seasonForm.equipmentId ? [seasonForm.equipmentId] : []))
const packageEquipmentPrice = computed(() => sumEquipmentIds(packageForm.equipmentId ? [packageForm.equipmentId] : []))
const seasonSessionCount = computed(() =>
  countRecurringSessions(seasonForm.days, seasonForm.times, selectedSlotFull.value?.date),
)
const packageSessionCount = computed(() =>
  countRecurringSessions(packageForm.days, packageForm.times, selectedSlotFull.value?.date),
)

function openSlot(slot: OwnerCalendarSlot | null | undefined) {
  if (!slot) return
  const fullSlot = (data.value?.slots?.find((s: { id: string }) => s.id === slot.id) || slot) as OwnerCalendarSlot
  selectedSlot.value = fullSlot
  showMenu.value = true
  resetPanels()
  activePanel.value = defaultPanelForSlot(fullSlot)
  cancelReason.value = ''
  actionError.value = ''
  form.guestName = fullSlot.booking?.guestName || ''
  form.guestFamily = fullSlot.booking?.guestFamily || ''
  form.guestMobile = fullSlot.booking?.guestMobile || ''
  form.paymentMethod = fullSlot.booking?.payment?.method || fullSlot.booking?.paymentMethod || 'CASH'
  form.paymentStatus = fullSlot.booking?.payment?.status || fullSlot.booking?.paymentStatus || 'PAY_AT_CLUB'
  form.comments = fullSlot.booking?.comments || ''
  const equipmentIds = fullSlot.booking?.bookingEquipments?.map((item) => item.equipmentId) || []
  form.equipmentIds = equipmentIds
  seasonForm.days = ['Sun']
  seasonForm.times = [fullSlot.startTime.slice(0, 5)]
  seasonForm.equipmentId = equipmentIds[0] || ''
  seasonForm.comments = fullSlot.booking?.comments || ''
  packageForm.coachId = fullSlot.booking?.coachId || ''
  packageForm.days = ['Sun']
  packageForm.times = [fullSlot.startTime.slice(0, 5)]
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
  seasonForm.days = toggleDay(seasonForm.days, day)
}

function togglePackageDay(day: string) {
  packageForm.days = toggleDay(packageForm.days, day)
}

function reserveDisplayStatus() {
  if (!selectedSlot.value) return 'RESERVED'
  return selectedSlot.value.displayStatus === 'FREE' ? 'RESERVED' : selectedSlot.value.displayStatus
}

async function doReserve() {
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

async function doCancel() {
  if (!selectedSlot.value || !cancelReason.value || saving.value) return
  saving.value = true
  actionError.value = ''
  try {
    await $fetch('/api/owner/cancel', {
      method: 'POST',
      body: { slotId: selectedSlot.value.id, reason: cancelReason.value },
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
  if (!selectedSlot.value || saving.value || !seasonForm.days.length) return
  saving.value = true
  actionError.value = ''
  try {
    await $fetch('/api/owner/season', {
      method: 'POST',
      body: {
        guestName: form.guestName,
        guestFamily: form.guestFamily,
        guestMobile: form.guestMobile,
        days: seasonForm.days,
        times: seasonForm.times,
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
  if (!selectedSlot.value || saving.value || !packageForm.days.length) return
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
        days: packageForm.days,
        times: packageForm.times,
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

function slotActionLabel() {
  return selectedSlot.value?.booking ? t('common.save') : t('owner.reserve')
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
  <div class="tail-page-stack">
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
                class="slot calendar-slot-card w-full text-start"
                :class="slotClass(cellSlot(court.id, hour)!.displayStatus)"
                @click="openSlot(cellSlot(court.id, hour))"
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
          </div>
          <button v-if="canCancelSlot()" type="button" :class="menuButtonClass('cancel')" @click="openCancelForm">{{ t('owner.cancel') }}</button>
          <button v-if="canReserveSlot()" type="button" :class="menuButtonClass('reserve')" @click="openReserveForm">{{ slotActionLabel() }}</button>
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
            <input v-model="form.guestName" :placeholder="t('owner.guestName')" class="neo-input" readonly>
            <input v-model="form.guestFamily" :placeholder="t('owner.guestFamily')" class="neo-input" readonly>
            <input v-model="form.guestMobile" :placeholder="t('owner.guestMobile')" dir="ltr" class="neo-input tabular-nums" readonly>
            <select v-model="cancelReason" class="neo-select">
              <option value="">{{ t('owner.cancelReasonPlaceholder') }}</option>
              <option v-for="reason in cancelReasons" :key="reason" :value="reason">{{ t(`owner.cancelReasons.${reason}`) }}</option>
            </select>
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
              <h3 class="font-bold text-brand-navy">{{ t('owner.reserve') }}</h3>
            </div>
          </div>
          <div class="venus-modal-panel-body venus-form-stack">
            <input v-model="form.guestName" :placeholder="t('owner.guestName')" class="neo-input">
            <input v-model="form.guestFamily" :placeholder="t('owner.guestFamily')" class="neo-input">
            <input v-model="form.guestMobile" :placeholder="t('owner.guestMobile')" dir="ltr" class="neo-input tabular-nums">
            <select v-model="form.paymentMethod" class="neo-select">
              <option value="IPG">{{ t('owner.paymentMethods.IPG') }}</option>
              <option value="CASH">{{ t('owner.paymentMethods.CASH') }}</option>
            </select>
            <select v-model="form.paymentStatus" class="neo-select">
              <option value="PAY_AT_CLUB">{{ t('booking.paymentStatus.PAY_AT_CLUB') }}</option>
              <option value="PAID">{{ t('booking.paymentStatus.PAID') }}</option>
            </select>
            <label class="block text-xs font-bold text-brand-gray-600">{{ t('owner.equipments') }}</label>
            <select v-model="form.equipmentIds" multiple class="neo-select min-h-[5rem]">
              <option v-for="item in rentalEquipments" :key="item.id" :value="item.id">{{ equipmentOptionLabel(item) }}</option>
            </select>
            <textarea v-model="form.comments" :placeholder="t('owner.comments')" class="neo-textarea" rows="3" />
          </div>
          <div class="venus-modal-footer">
            <OwnerBookingPriceSummary
              :court-price="courtPrice"
              :equipment-price="reserveEquipmentPrice"
            />
            <p v-if="actionError" class="venus-alert-error">{{ actionError }}</p>
            <button type="button" class="btn-primary w-full" :disabled="saving" @click="doReserve">{{ saving ? t('common.loading') : slotActionLabel() }}</button>
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
            <textarea v-model="form.comments" :placeholder="t('owner.comments')" class="neo-textarea" rows="6" />
          </div>
          <div class="venus-modal-footer">
            <p v-if="actionError" class="venus-alert-error">{{ actionError }}</p>
            <button v-if="selectedSlot?.booking || canReserveSlot()" type="button" class="btn-primary w-full" :disabled="saving" @click="doReserve">{{ saving ? t('common.loading') : t('common.save') }}</button>
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
                <input v-model="form.guestName" :placeholder="t('owner.guestName')" class="neo-input">
                <input v-model="form.guestFamily" :placeholder="t('owner.guestFamily')" class="neo-input">
                <input v-model="form.guestMobile" :placeholder="t('owner.guestMobile')" dir="ltr" class="neo-input tabular-nums">
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
                <select v-model="seasonForm.equipmentId" class="neo-select">
                  <option value="">{{ t('owner.packagesPage.equipmentPlaceholder') }}</option>
                  <option v-for="item in rentalEquipments" :key="item.id" :value="item.id">{{ equipmentOptionLabel(item) }}</option>
                </select>
                <textarea v-model="seasonForm.comments" :placeholder="t('owner.comments')" class="neo-textarea" rows="3" />
              </div>
              <OwnerClockPicker v-model="seasonForm.times" class="w-full shrink-0 lg:w-40" />
            </div>
          </div>
          <div class="venus-modal-footer">
            <OwnerBookingPriceSummary
              :court-price="courtPrice"
              :equipment-price="seasonEquipmentPrice"
              :session-count="seasonSessionCount"
              show-estimated
            />
            <p v-if="actionError" class="venus-alert-error">{{ actionError }}</p>
            <button type="button" class="btn-primary w-full" :disabled="saving || !seasonForm.days.length" @click="doSeasonReserve">{{ saving ? t('common.loading') : t('common.save') }}</button>
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
                <select v-model="packageForm.coachId" class="neo-select">
                  <option value="">{{ t('owner.packagePage.coachPlaceholder') }}</option>
                  <option v-for="coach in clubCoaches" :key="coach.id" :value="coach.id">{{ localizedField(coach, 'nameFa', 'nameEn') }}</option>
                </select>
                <input v-model="form.guestName" :placeholder="t('owner.guestName')" class="neo-input">
                <input v-model="form.guestFamily" :placeholder="t('owner.guestFamily')" class="neo-input">
                <input v-model="form.guestMobile" :placeholder="t('owner.guestMobile')" dir="ltr" class="neo-input tabular-nums">
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
                <select v-model="packageForm.equipmentId" class="neo-select">
                  <option value="">{{ t('owner.packagesPage.equipmentPlaceholder') }}</option>
                  <option v-for="item in rentalEquipments" :key="item.id" :value="item.id">{{ equipmentOptionLabel(item) }}</option>
                </select>
                <textarea v-model="packageForm.comments" :placeholder="t('owner.comments')" class="neo-textarea" rows="3" />
              </div>
              <OwnerClockPicker v-model="packageForm.times" class="w-full shrink-0 lg:w-40" />
            </div>
          </div>
          <div class="venus-modal-footer">
            <OwnerBookingPriceSummary
              :court-price="courtPrice"
              :coach-price="packageForm.coachId && selectedCoach ? selectedCoach.sessionPrice : undefined"
              :equipment-price="packageEquipmentPrice"
              :session-count="packageSessionCount"
              show-estimated
            />
            <p v-if="actionError" class="venus-alert-error">{{ actionError }}</p>
            <button type="button" class="btn-primary w-full" :disabled="saving || !packageForm.days.length" @click="doPackageReserve">{{ saving ? t('common.loading') : t('common.save') }}</button>
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
            <label class="block text-xs font-bold text-brand-gray-600">{{ t('owner.equipmentsPage.selectForBooking') }}</label>
            <select v-model="form.equipmentIds" multiple class="neo-select min-h-[8rem]">
              <option v-for="item in rentalEquipments" :key="item.id" :value="item.id">{{ equipmentOptionLabel(item) }}</option>
            </select>
            <textarea v-model="form.comments" :placeholder="t('owner.comments')" class="neo-textarea" rows="3" />
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
