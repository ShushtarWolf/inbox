<script setup lang="ts">
import { palette } from '#shared/palette.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

interface OwnerCalendarBooking {
  guestName?: string | null
  guestFamily?: string | null
  guestMobile?: string | null
  payment?: { method?: string; status?: string } | null
  paymentMethod?: string | null
  paymentStatus?: string | null
  comments?: string | null
}

interface OwnerCalendarSlot {
  id: string
  courtId: string
  startTime: string
  endTime: string
  displayStatus: string
  booking?: OwnerCalendarBooking | null
}

const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatDate, formatWeekday, formatTimeRange, formatNumber } = useFormatters()
const { today } = useLocalDate()

const date = ref(today())
const selectedSlot = ref<OwnerCalendarSlot | null>(null)
const showMenu = ref(false)
const showReserve = ref(false)
const showCancel = ref(false)
const cancelReason = ref('')

const form = reactive({
  guestName: '',
  guestFamily: '',
  guestMobile: '',
  paymentMethod: 'CASH',
  paymentStatus: 'PAY_AT_CLUB',
  comments: '',
  equipmentIds: [] as string[],
})

const { data: equipments } = await useAuthedFetch('/api/owner/equipments')

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
const dayNumber = computed(() => formatNumber(currentDate.value.getDate()))
const weekdayLabel = computed(() => formatWeekday(currentDate.value))

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

  return statusLabel(slot.displayStatus)
}

function openSlot(slot: OwnerCalendarSlot | null | undefined) {
  if (!slot) return
  selectedSlot.value = slot
  showMenu.value = true
  showReserve.value = false
  showCancel.value = false
  cancelReason.value = ''
  form.guestName = slot.booking?.guestName || ''
  form.guestFamily = slot.booking?.guestFamily || ''
  form.guestMobile = slot.booking?.guestMobile || ''
  form.paymentMethod = slot.booking?.payment?.method || slot.booking?.paymentMethod || 'CASH'
  form.paymentStatus = slot.booking?.payment?.status || slot.booking?.paymentStatus || 'PAY_AT_CLUB'
  form.comments = slot.booking?.comments || ''
  form.equipmentIds = []
}

function openReserveForm() {
  showReserve.value = true
  showCancel.value = false
}

function openCancelForm() {
  showCancel.value = true
  showReserve.value = false
}

function openCommentsForm() {
  showReserve.value = true
  showCancel.value = false
}

function closeMenu() {
  showMenu.value = false
  showReserve.value = false
  showCancel.value = false
  cancelReason.value = ''
}

function slotQuery() {
  if (!selectedSlot.value) return {}
  return {
    slotId: selectedSlot.value.id,
    guestName: form.guestName || undefined,
    guestFamily: form.guestFamily || undefined,
    guestMobile: form.guestMobile || undefined,
    comments: form.comments || undefined,
  }
}

function goSeasonReserve() {
  closeMenu()
  navigateTo(localePath({ path: '/owner/reserve/season', query: slotQuery() }))
}

function goPackageReserve() {
  closeMenu()
  navigateTo(localePath({ path: '/owner/reserve/package', query: slotQuery() }))
}

function reserveComments() {
  const equipmentNames = (equipments.value || [])
    .filter((item: { id: string }) => form.equipmentIds.includes(item.id))
    .map((item: { nameFa: string; nameEn: string }) => localizedField(item, 'nameFa', 'nameEn'))
  const equipmentNote = equipmentNames.length ? `${t('owner.equipments')}: ${equipmentNames.join(', ')}` : ''
  return [form.comments, equipmentNote].filter(Boolean).join('\n')
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
  if (selectedSlot.value.displayStatus === 'FREE') {
    return t('owner.status.FREE')
  }
  return statusLabel(selectedSlot.value.displayStatus)
}

function slotGuestName() {
  if (!selectedSlot.value?.booking) return ''
  return [selectedSlot.value.booking.guestName, selectedSlot.value.booking.guestFamily].filter(Boolean).join(' ').trim()
}

async function doReserve() {
  if (!selectedSlot.value) return
  await $fetch('/api/owner/reserve', {
    method: 'POST',
    body: {
      slotId: selectedSlot.value.id,
      guestName: form.guestName,
      guestFamily: form.guestFamily,
      guestMobile: form.guestMobile,
      paymentMethod: form.paymentMethod,
      paymentStatus: form.paymentStatus,
      comments: reserveComments(),
      displayStatus: 'RESERVED',
    },
  })
  closeMenu()
  refresh()
}

async function doCancel() {
  if (!selectedSlot.value || !cancelReason.value) return
  await $fetch('/api/owner/cancel', {
    method: 'POST',
    body: { slotId: selectedSlot.value.id, reason: cancelReason.value },
  })
  closeMenu()
  refresh()
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
  <div class="space-y-6">
    <p v-if="pending" class="text-sm text-brand-gray-600">{{ t('common.loading') }}</p>
    <p v-else-if="error" class="text-sm text-red-600">{{ t('common.error') }}</p>

    <section v-else class="calendar-shell overflow-hidden rounded-[2rem] border border-[#e9e6f2] bg-white shadow-[0_30px_80px_rgba(41,29,87,0.08)]">
      <div class="border-b border-[#f0eef7] px-5 py-5 sm:px-7">
        <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p class="mb-1 text-xs font-semibold tracking-[0.24em] text-[#a6a1b5]">{{ t('owner.dashboardEyebrow') }}</p>
            <h1 class="font-display text-2xl font-black text-[#27243a]">{{ t('owner.calendar') }}</h1>
            <p class="mt-1 text-sm text-[#8a859d]">{{ t('owner.calendarSubtitle', { date: formattedDate }) }}</p>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <label class="calendar-date-picker">
              <span>{{ t('common.date') }}</span>
              <input v-model="date" type="date" dir="ltr" class="calendar-date-input tabular-nums">
            </label>
          </div>
        </div>

        <div class="mt-5 flex justify-end">
          <div class="calendar-toolbar-pill font-semibold text-[#5d5873]">
            <span>{{ weekdayLabel }}</span>
            <bdi dir="ltr" class="tabular-nums">{{ dayNumber }}</bdi>
          </div>
        </div>
      </div>

      <div v-if="!courts.length" class="px-5 py-8 text-center text-sm text-[#8a859d]">
        {{ t('common.empty') }}
      </div>

      <div v-else class="overflow-x-auto px-3 pb-3 pt-4 sm:px-5 sm:pb-5">
        <div class="min-w-[900px]">
          <div class="grid calendar-grid border-b border-[#f2f0f7] pb-3">
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
            class="grid calendar-grid border-b border-[#f6f4fb] last:border-b-0"
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

    <aside v-if="!pending && !error" class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div class="rounded-[1.5rem] border border-[#ece8f6] bg-white p-5 shadow-[0_20px_50px_rgba(41,29,87,0.06)]">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h2 class="text-base font-bold text-[#27243a]">{{ t('owner.legend') }}</h2>
            <p class="mt-1 text-sm text-[#8a859d]">{{ t('owner.legendHint') }}</p>
          </div>
          <span class="rounded-full bg-[#f6f3ff] px-3 py-1 text-xs font-semibold text-[#6f6885]">{{ t('common.courtsCount', { count: formatNumber(courts.length) }) }}</span>
        </div>
        <div class="mt-4 flex flex-wrap gap-3">
          <div v-for="item in legend" :key="item.status" class="calendar-legend-item">
            <span class="calendar-legend-dot" :style="{ background: item.color }" />
            {{ statusLabel(item.status) }}
          </div>
        </div>
      </div>

      <div class="rounded-[1.5rem] border border-[#ece8f6] bg-[#faf8ff] p-5 shadow-[0_20px_50px_rgba(41,29,87,0.04)]">
        <h2 class="text-base font-bold text-[#27243a]">{{ t('owner.quickNotes') }}</h2>
        <p class="mt-2 text-sm leading-6 text-[#8a859d]">
          {{ t('owner.quickNotesBody') }}
        </p>
      </div>
    </aside>

    <AppModal :open="showMenu" :title="t('owner.slotActions')" max-width-class="max-w-4xl" @close="closeMenu">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div class="w-full shrink-0 rounded-xl bg-white shadow-lg lg:w-52">
          <div v-if="selectedSlot" class="border-b px-4 py-3 text-sm">
            <p class="font-bold"><bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(selectedSlot.startTime, selectedSlot.endTime) }}</bdi></p>
            <p class="mt-1 text-brand-gray-600">{{ slotGuestName() || statusLabel(selectedSlot.displayStatus) }}</p>
            <p class="mt-1 text-xs text-brand-gray-600">{{ slotStatusSummary() }}</p>
          </div>
          <button v-if="canCancelSlot()" type="button" class="block w-full border-b px-4 py-3 text-start text-sm font-bold" @click="openCancelForm">{{ t('owner.cancel') }}</button>
          <button v-if="canReserveSlot()" type="button" class="block w-full border-b bg-brand-primary px-4 py-3 text-start text-sm font-bold text-white" @click="openReserveForm">{{ slotActionLabel() }}</button>
          <button v-if="canReserveSlot()" type="button" class="block w-full border-b px-4 py-3 text-start text-sm" @click="goSeasonReserve">{{ t('owner.seasonReserve') }}</button>
          <button v-if="canReserveSlot()" type="button" class="block w-full border-b px-4 py-3 text-start text-sm" @click="goPackageReserve">{{ t('owner.reserveWithCoach') }}</button>
          <button type="button" class="block w-full border-b px-4 py-3 text-start text-sm" @click="openCommentsForm">{{ t('owner.comments') }}</button>
          <NuxtLink :to="localePath('/owner/equipments')" class="block w-full border-b px-4 py-3 text-start text-sm" @click="closeMenu">{{ t('owner.equipments') }}</NuxtLink>
          <button type="button" class="block w-full px-4 py-3 text-start text-sm" @click="closeMenu">{{ t('common.close') }}</button>
        </div>

        <div v-if="showCancel" class="min-w-0 flex-1 rounded-xl bg-white p-4 shadow-lg">
          <h3 class="mb-3 font-bold">{{ t('owner.cancel') }}</h3>
          <input v-model="form.guestName" :placeholder="t('owner.guestName')" class="mb-2 w-full rounded border px-2 py-1.5 text-sm" readonly>
          <input v-model="form.guestFamily" :placeholder="t('owner.guestFamily')" class="mb-2 w-full rounded border px-2 py-1.5 text-sm" readonly>
          <input v-model="form.guestMobile" :placeholder="t('owner.guestMobile')" dir="ltr" class="mb-2 w-full rounded border px-2 py-1.5 text-sm tabular-nums" readonly>
          <select v-model="cancelReason" class="mb-3 w-full rounded border px-2 py-1.5 text-sm">
            <option value="">{{ t('owner.cancelReasonPlaceholder') }}</option>
            <option v-for="reason in cancelReasons" :key="reason" :value="reason">{{ t(`owner.cancelReasons.${reason}`) }}</option>
          </select>
          <div class="flex gap-2">
            <button type="button" class="btn-primary flex-1" :disabled="!cancelReason" @click="doCancel">{{ t('owner.cancel') }}</button>
            <button type="button" class="btn-ghost flex-1" @click="showCancel = false">{{ t('common.back') }}</button>
          </div>
        </div>

        <div v-if="showReserve" class="min-w-0 flex-1 rounded-xl bg-white p-4 shadow-lg">
          <h3 class="mb-3 font-bold">{{ t('owner.reserve') }}</h3>
          <input v-model="form.guestName" :placeholder="t('owner.guestName')" class="mb-2 w-full rounded border px-2 py-1.5 text-sm">
          <input v-model="form.guestFamily" :placeholder="t('owner.guestFamily')" class="mb-2 w-full rounded border px-2 py-1.5 text-sm">
          <input v-model="form.guestMobile" :placeholder="t('owner.guestMobile')" dir="ltr" class="mb-2 w-full rounded border px-2 py-1.5 text-sm tabular-nums">
          <select v-model="form.paymentMethod" class="mb-2 w-full rounded border px-2 py-1.5 text-sm">
            <option value="IPG">{{ t('owner.paymentMethods.IPG') }}</option>
            <option value="CASH">{{ t('owner.paymentMethods.CASH') }}</option>
          </select>
          <select v-model="form.paymentStatus" class="mb-2 w-full rounded border px-2 py-1.5 text-sm">
            <option value="PAY_AT_CLUB">{{ t('booking.paymentStatus.PAY_AT_CLUB') }}</option>
            <option value="PAID">{{ t('booking.paymentStatus.PAID') }}</option>
          </select>
          <label class="mb-2 block text-xs font-semibold text-brand-gray-600">{{ t('owner.equipments') }}</label>
          <select v-model="form.equipmentIds" multiple class="mb-2 min-h-[5rem] w-full rounded border px-2 py-1.5 text-sm">
            <option v-for="item in rentalEquipments" :key="item.id" :value="item.id">{{ localizedField(item, 'nameFa', 'nameEn') }}</option>
          </select>
          <textarea v-model="form.comments" :placeholder="t('owner.comments')" class="mb-3 w-full rounded border px-2 py-1.5 text-sm" rows="2" />
          <button type="button" class="btn-primary w-full" @click="doReserve">{{ slotActionLabel() }}</button>
        </div>
      </div>
    </AppModal>
  </div>
</template>

<style scoped>
.slot {
  cursor: pointer;
}

.calendar-shell {
  background: linear-gradient(180deg, rgba(250, 248, 255, 0.72) 0%, rgba(255, 255, 255, 1) 22%);
}

.calendar-grid {
  grid-template-columns: 5.5rem repeat(auto-fit, minmax(8.5rem, 1fr));
}

.calendar-date-picker,
.calendar-toolbar-pill,
.calendar-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 999px;
  border: 1px solid #ece8f6;
  background: #fff;
  padding: 0.7rem 1rem;
  font-size: 0.875rem;
}

.calendar-date-picker {
  color: #6f6885;
}

.calendar-date-input {
  border: 0;
  background: transparent;
  color: #27243a;
  font-weight: 600;
  outline: none;
}

.calendar-primary-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #27243a;
  padding: 0.85rem 1.2rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: #fff;
}

.calendar-tab {
  color: #8f89a1;
}

.calendar-tab-active {
  border-color: #e1dcf3;
  background: #f3efff;
  color: #534c68;
  font-weight: 700;
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
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #b0a9c2;
}

.calendar-column-title {
  font-size: 0.95rem;
  font-weight: 800;
  color: #27243a;
}

.calendar-time-cell,
.calendar-slot-cell {
  min-height: 7rem;
  padding: 0.65rem 0.55rem;
}

.calendar-time-cell {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 1rem;
}

.calendar-time {
  font-size: 0.78rem;
  font-weight: 800;
  color: #a49db7;
}

.calendar-slot-card {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 0.45rem;
  border-radius: 1.3rem;
  padding: 0.95rem;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.calendar-slot-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 28px rgba(59, 47, 99, 0.08);
}

.calendar-slot-time {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  opacity: 0.8;
}

.calendar-slot-title {
  font-size: 0.84rem;
  font-weight: 800;
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
  border-radius: 999px;
  background: #faf8ff;
  padding: 0.7rem 0.95rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: #5d5873;
}

.calendar-legend-dot {
  height: 0.7rem;
  width: 0.7rem;
  border-radius: 999px;
}

:deep(.slot-free) {
  background: #f4f1f8;
  color: #716a84;
}

:deep(.slot-reserved) {
  background: #dbeafe;
  color: #255485;
}

:deep(.slot-public) {
  background: #e9defe;
  color: #6e47c9;
}

:deep(.slot-team) {
  background: #d7f4ef;
  color: #2d776e;
}

:deep(.slot-pending) {
  background: #fee7d5;
  color: #ad6332;
}

:deep(.slot-cancel) {
  background: #eceaf1;
  color: #8a859d;
}

:deep(.slot-closed) {
  background: #dfe4f2;
  color: #55617e;
}

@media (max-width: 640px) {
  .calendar-time-cell,
  .calendar-slot-cell {
    min-height: 6.25rem;
  }
}
</style>
