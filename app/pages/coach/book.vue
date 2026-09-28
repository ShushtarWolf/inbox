<script setup lang="ts">
import { sortCourtsByOrdinal } from '#shared/courtDisplay.ts'
import { WALLET_TOPUP_MAX_IRR, WALLET_TOPUP_MIN_IRR } from '#shared/walletTopUp.ts'
import { fetchErrorMessage } from '~/composables/useFetchError'

definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { formatCurrency, formatDate, formatTimeRange, formatFaDigits } = useFormatters()
const { onlineEnabled, redirectToPaymentGateway } = useCheckout()

const route = useRoute()
const { today } = useLocalDate()

type ClubOption = { id: string; nameFa: string; nameEn: string; city: string }
type CourtSlot = {
  id: string
  courtId: string
  courtNameFa: string
  courtNameEn: string
  startTime: string
  endTime: string
  listedPrice: number
  courtCharge: number
}
type CourtGroup = {
  courtId: string
  courtNameFa: string
  courtNameEn: string
  bookable: CourtSlot[]
  blocked: CourtSlot[]
}

const initialDate = typeof route.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(route.query.date)
  ? route.query.date
  : today()
const initialTime = typeof route.query.time === 'string' ? route.query.time.slice(0, 5) : ''
/** Arrived from the coach calendar with a day and hour already chosen — student only, no court. */
const fromCalendar = Boolean(
  typeof route.query.date === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(route.query.date)
  && initialTime,
)
const scheduleBack = computed(() => localePath({ path: '/coach/schedule', query: { date: initialDate } }))
const calendarEndTime = computed(() => {
  if (!initialTime) return ''
  const hour = (Number(initialTime.slice(0, 2)) + 1) % 24
  return `${String(hour).padStart(2, '0')}:00`
})

// Lazy fetches so Nuxt Suspense + page out-in does not leave an empty cream main while APIs run.
const { data: clubsData, pending, error } = await useAuthedFetch<{
  clubs: ClubOption[]
}>('/api/coach/clubs', { lazy: true, immediate: !fromCalendar })
const { data: wallet, refresh: refreshWallet } = await useAuthedFetch<{ balance: number }>('/api/wallet', {
  lazy: true,
  immediate: !fromCalendar,
})
const { data: coachProfile } = await useAuthedFetch<{ sessionPrice: number }>('/api/coach/profile', {
  lazy: true,
  immediate: fromCalendar,
})

const clubs = computed(() => clubsData.value?.clubs || [])

const clubId = ref('')
const date = ref(initialDate)
const selectedCourtId = ref('')
const selectedSlotId = ref('')
const studentPhone = ref('')
const studentName = ref('')
type StudentSearchHit = { name: string; mobile: string }
const studentSuggestions = ref<StudentSearchHit[]>([])
const studentSearchOpen = ref(false)
const studentSearchPending = ref(false)
const studentSearchSource = ref<'name' | 'mobile'>('name')
let studentSearchTimer: ReturnType<typeof setTimeout> | null = null
let studentSearchRequest = 0
const submitting = ref(false)
const errorKey = ref('')
const successMessage = ref('')

watch(clubs, (list) => {
  if (!list.length) {
    clubId.value = ''
    return
  }
  if (!clubId.value || !list.some((club) => club.id === clubId.value)) {
    clubId.value = list[0]!.id
  }
}, { immediate: true })

const { data: slotData, pending: slotsPending, refresh: refreshSlots } = await useAuthedFetch<{
  sessionPrice: number
  slots: CourtSlot[]
}>('/api/coach/court-slots', {
  query: computed(() => ({ clubId: clubId.value, date: date.value })),
  immediate: false,
  lazy: true,
  // Avoid 400 when clubId is still empty; refresh only once a club is selected.
  watch: false,
})
const showSlotsPending = useHeldPending(slotsPending)

const {
  isExternalOnlyOccupied,
  isExternalUncertain,
  externalSiteBadge,
  refreshExternalOverlay,
} = useCoachExternalCalendarOverlay({ clubId, date })

const bookableSlots = computed(() =>
  (slotData.value?.slots || []).filter((slot) => !isExternalOnlyOccupied(slot) && !isExternalUncertain(slot)),
)

const blockedExternalSlots = computed(() =>
  (slotData.value?.slots || []).filter((slot) => isExternalOnlyOccupied(slot)),
)

const uncertainExternalSlots = computed(() =>
  (slotData.value?.slots || []).filter((slot) => isExternalUncertain(slot)),
)

/** Courts as a list first — hours only appear under the selected court. */
const courtGroups = computed((): CourtGroup[] => {
  const map = new Map<string, CourtGroup>()
  function ensure(slot: CourtSlot): CourtGroup {
    let group = map.get(slot.courtId)
    if (!group) {
      group = {
        courtId: slot.courtId,
        courtNameFa: slot.courtNameFa,
        courtNameEn: slot.courtNameEn,
        bookable: [],
        blocked: [],
      }
      map.set(slot.courtId, group)
    }
    return group
  }
  for (const slot of bookableSlots.value) ensure(slot).bookable.push(slot)
  for (const slot of blockedExternalSlots.value) ensure(slot).blocked.push(slot)
  for (const slot of uncertainExternalSlots.value) ensure(slot).blocked.push(slot)
  for (const group of map.values()) {
    group.bookable.sort((a, b) => a.startTime.localeCompare(b.startTime))
    group.blocked.sort((a, b) => a.startTime.localeCompare(b.startTime))
  }
  return sortCourtsByOrdinal([...map.values()])
})

const selectedCourtGroup = computed(() =>
  courtGroups.value.find((group) => group.courtId === selectedCourtId.value) || null,
)

watch(slotData, (next) => {
  if (!next?.slots?.length || selectedSlotId.value || !initialTime) return
  const match = next.slots.find((slot) =>
    slot.startTime.slice(0, 5) === initialTime && !isExternalOnlyOccupied(slot) && !isExternalUncertain(slot),
  )
  if (match) {
    selectedCourtId.value = match.courtId
    selectedSlotId.value = match.id
  }
}, { immediate: true })

watch(courtGroups, (groups) => {
  if (!groups.length) {
    selectedCourtId.value = ''
    return
  }
  if (selectedCourtId.value && groups.some((group) => group.courtId === selectedCourtId.value)) return
  const fromSlot = selectedSlotId.value
    ? groups.find((group) =>
        group.bookable.some((slot) => slot.id === selectedSlotId.value)
        || group.blocked.some((slot) => slot.id === selectedSlotId.value),
      )
    : null
  const withBookable = groups.find((group) => group.bookable.length > 0)
  selectedCourtId.value = (fromSlot || withBookable || groups[0])!.courtId
}, { immediate: true })

const selectedSlot = computed(() => (slotData.value?.slots || []).find((slot) => slot.id === selectedSlotId.value) || null)
const canSubmit = computed(() => {
  if (submitting.value || !studentPhone.value.trim()) return false
  if (fromCalendar) return true
  return Boolean(selectedSlot.value)
})
const shortfall = computed(() =>
  selectedSlot.value ? Math.max(0, selectedSlot.value.courtCharge - (wallet.value?.balance || 0)) : 0,
)

function selectCourt(courtId: string) {
  if (selectedCourtId.value === courtId) return
  selectedCourtId.value = courtId
  selectedSlotId.value = ''
}

watch([clubId, date], () => {
  selectedCourtId.value = ''
  selectedSlotId.value = ''
  errorKey.value = ''
  successMessage.value = ''
  if (clubId.value) void refreshSlots()
}, { immediate: true })

async function refreshSlotsAndOverlay() {
  await Promise.all([refreshSlots(), refreshExternalOverlay()])
}

function clearStudentSearch() {
  if (studentSearchTimer) {
    clearTimeout(studentSearchTimer)
    studentSearchTimer = null
  }
  // Drop a response that arrives after the coach picked a row, cleared the field, or submitted.
  studentSearchRequest += 1
  studentSuggestions.value = []
  studentSearchOpen.value = false
  studentSearchPending.value = false
}

async function runStudentSearch(raw: string) {
  const q = raw.trim()
  if (q.length < 2) {
    clearStudentSearch()
    return
  }
  const requestId = ++studentSearchRequest
  studentSearchPending.value = true
  studentSearchOpen.value = true
  try {
    const res = await $fetch<{ students: StudentSearchHit[] }>('/api/coach/students/search', {
      query: { q },
    })
    if (requestId !== studentSearchRequest) return
    studentSuggestions.value = res.students || []
  }
  catch {
    if (requestId !== studentSearchRequest) return
    studentSuggestions.value = []
  }
  finally {
    if (requestId === studentSearchRequest) {
      studentSearchPending.value = false
      studentSearchOpen.value = studentSuggestions.value.length > 0
    }
  }
}

function scheduleStudentSearch(raw: string) {
  if (studentSearchTimer) clearTimeout(studentSearchTimer)
  studentSearchTimer = setTimeout(() => {
    void runStudentSearch(raw)
  }, 250)
}

function onStudentNameInput() {
  studentSearchSource.value = 'name'
  scheduleStudentSearch(studentName.value)
}

function onStudentPhoneInput() {
  studentSearchSource.value = 'mobile'
  scheduleStudentSearch(studentPhone.value)
}

function selectStudentSuggestion(student: StudentSearchHit) {
  if (student.name) studentName.value = student.name
  if (student.mobile) studentPhone.value = student.mobile
  clearStudentSearch()
}

function closeStudentSearchSoon() {
  setTimeout(() => {
    studentSearchOpen.value = false
  }, 150)
}

function serverMessage(err: unknown) {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data?: { statusMessage?: string } }).data
    if (data?.statusMessage) return data.statusMessage
  }
  if (err && typeof err === 'object' && 'statusMessage' in err) {
    return String((err as { statusMessage?: string }).statusMessage || '')
  }
  return ''
}

/** Server statusMessages are stable identifiers; map them so the coach sees why it failed. */
function messageToKey(message: string) {
  if (message.includes('Insufficient wallet balance')) return 'coach.book.errorInsufficient'
  if (message.includes('Slot not available')) return 'coach.book.errorSlotTaken'
  if (message.includes('not available at this time')) return 'coach.book.errorNotInSchedule'
  if (message.includes('already booked')) return 'coach.book.errorCoachBusy'
  if (message.includes('COACH_NOT_APPROVED')) return 'coach.book.errorNotApproved'
  if (message.includes('own student')) return 'coach.book.errorSelfStudent'
  return 'coach.book.errorGeneric'
}

async function submitCalendarStudent() {
  if (!studentPhone.value.trim() || submitting.value) return
  submitting.value = true
  errorKey.value = ''
  successMessage.value = ''
  try {
    await $fetch('/api/coach/sessions', {
      method: 'POST',
      body: {
        date: initialDate,
        startTime: initialTime,
        studentPhone: studentPhone.value.trim(),
        studentName: studentName.value.trim() || undefined,
      },
    })
    clearStudentSearch()
    await navigateTo(scheduleBack.value)
  }
  catch (err) {
    errorKey.value = messageToKey(serverMessage(err))
  }
  finally {
    submitting.value = false
  }
}

async function submit() {
  if (fromCalendar) {
    await submitCalendarStudent()
    return
  }
  if (!canSubmit.value) return
  submitting.value = true
  errorKey.value = ''
  successMessage.value = ''
  try {
    const result = await $fetch<{ courtCharge: number; sessionPrice: number }>('/api/coach/lessons', {
      method: 'POST',
      body: {
        slotId: selectedSlotId.value,
        studentPhone: studentPhone.value.trim(),
        studentName: studentName.value.trim() || undefined,
      },
    })
    successMessage.value = t('coach.book.success', {
      charge: formatCurrency(result.courtCharge),
      fee: formatCurrency(result.sessionPrice),
    })
    selectedSlotId.value = ''
    studentPhone.value = ''
    studentName.value = ''
    clearStudentSearch()
    await Promise.all([refreshSlotsAndOverlay(), refreshWallet()])
  }
  catch (err) {
    errorKey.value = messageToKey(serverMessage(err))
  }
  finally {
    submitting.value = false
  }
}

const topUpOpen = ref(false)
const topUpAmount = ref(WALLET_TOPUP_MIN_IRR)
const topUpBusy = ref(false)
const topUpError = ref('')

function openTopUp() {
  // Default to whatever this booking is short by, rounded up to the gateway minimum.
  topUpAmount.value = Math.min(WALLET_TOPUP_MAX_IRR, Math.max(WALLET_TOPUP_MIN_IRR, shortfall.value))
  topUpError.value = ''
  topUpOpen.value = true
}

async function startTopUp() {
  if (topUpBusy.value) return
  topUpError.value = ''
  if (!onlineEnabled.value) {
    topUpError.value = t('athlete.walletTopUpRequiresOnline')
    return
  }
  if (topUpAmount.value < WALLET_TOPUP_MIN_IRR || topUpAmount.value > WALLET_TOPUP_MAX_IRR) {
    topUpError.value = t('athlete.walletTopUpInvalidAmount', {
      min: formatCurrency(WALLET_TOPUP_MIN_IRR),
      max: formatCurrency(WALLET_TOPUP_MAX_IRR),
    })
    return
  }
  topUpBusy.value = true
  try {
    const session = await $fetch<{ intent: { redirectUrl?: string } }>('/api/wallet/topup', {
      method: 'POST',
      body: { amount: topUpAmount.value },
    })
    if (session.intent.redirectUrl) {
      await redirectToPaymentGateway(session.intent.redirectUrl)
      return
    }
    topUpError.value = t('athlete.walletTopUpFailed')
  }
  catch (err: unknown) {
    topUpError.value = fetchErrorMessage(err, t('athlete.walletTopUpFailed'))
  }
  finally {
    topUpBusy.value = false
  }
}
</script>

<template>
  <div class="venus-page-stack">
    <CanvaCoachPhotoHero />
    <div class="canva-cal-sheet -mx-4 min-[431px]:mx-0">
      <h1 class="mb-0 text-start text-base font-bold text-brand-navy min-[431px]:text-xl min-[431px]:leading-snug">
        {{ fromCalendar ? $t('coach.book.addStudentTitle') : $t('coach.book.title') }}
      </h1>
      <section v-if="fromCalendar" class="canva-panel space-y-2">
        <p class="text-start text-xs font-bold text-brand-gray-600">{{ $t('coach.book.addStudentWhen') }}</p>
        <p class="text-start text-base font-bold text-brand-navy">
          {{ formatDate(`${initialDate}T12:00:00`) }}
          ·
          <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(initialTime, calendarEndTime) }}</bdi>
        </p>
        <NuxtLink :to="scheduleBack" class="inline-block text-sm font-bold text-brand-primary no-underline">
          {{ $t('coach.book.changeSlot') }}
        </NuxtLink>
      </section>
      <p v-if="fromCalendar" class="text-start text-sm text-brand-gray-600">{{ $t('coach.book.addStudentSubtitle') }}</p>
      <AppAsyncState v-if="!fromCalendar" :pending="pending" :error="error" skeleton-variant="default">
        <p class="text-start text-sm text-brand-gray-600">{{ $t('coach.book.subtitle') }}</p>

        <section class="canva-panel space-y-3">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0 flex-1 text-start">
              <p class="text-xs font-bold text-brand-gray-600">{{ $t('coach.book.walletBalance') }}</p>
              <p class="mt-0.5 text-base font-bold text-brand-navy tabular-nums" dir="auto">
                {{ formatCurrency(wallet?.balance || 0) }}
              </p>
            </div>
            <button
              type="button"
              class="canva-cal-date-select shrink-0"
              @click="topUpOpen ? topUpOpen = false : openTopUp()"
            >
              {{ $t('coach.book.topUp') }}
            </button>
          </div>
          <div v-if="topUpOpen" class="space-y-2 border-t border-brand-gray-100 pt-3">
            <AppNumericInput v-model="topUpAmount" :min="WALLET_TOPUP_MIN_IRR" :max="WALLET_TOPUP_MAX_IRR" />
            <p v-if="topUpError" class="venus-alert-error p-2 text-start text-xs">{{ topUpError }}</p>
            <button
              type="button"
              class="canva-gate-btn-primary"
              :class="{ 'canva-cta-busy': topUpBusy }"
              :disabled="topUpBusy"
              :aria-busy="topUpBusy"
              @click="startTopUp"
            >
              {{ topUpBusy ? $t('common.loading') : $t('coach.book.topUpConfirm') }}
            </button>
          </div>
        </section>

        <p
          v-if="!clubs.length"
          class="border border-dashed border-brand-gray-200 bg-brand-cream px-3 py-8 text-center text-sm text-brand-gray-500"
          style="border-radius: var(--sz-canva-radius);"
        >
          {{ $t('coach.book.noClubs') }}
        </p>

        <div v-else class="venus-form-stack">
          <section class="canva-panel space-y-3">
            <AppFormField :label="$t('coach.book.club')">
              <select v-model="clubId" class="neo-select">
                <option v-for="club in clubs" :key="club.id" :value="club.id">
                  {{ formatFaDigits(club.nameFa) }} — {{ formatFaDigits(club.city) }}
                </option>
              </select>
            </AppFormField>

            <AppDateInput v-model="date" :label="$t('common.date')" />
          </section>

          <section class="space-y-3">
            <h2 class="text-start text-sm font-bold text-brand-navy">{{ $t('coach.book.pickSlot') }}</h2>
            <div v-if="showSlotsPending" class="flex justify-center py-4">
              <AppVenusSpinner size="sm" :label="$t('common.loading')" compact />
            </div>
            <p
              v-else-if="!slotData?.slots?.length"
              class="border border-dashed border-brand-gray-200 bg-brand-cream px-3 py-8 text-center text-sm text-brand-gray-500"
              style="border-radius: var(--sz-canva-radius);"
            >
              {{ $t('coach.book.noSlots') }}
            </p>
            <p
              v-else-if="!bookableSlots.length && (blockedExternalSlots.length || uncertainExternalSlots.length)"
              class="border border-dashed border-brand-gray-200 bg-brand-cream px-3 py-8 text-center text-sm text-brand-gray-500"
              style="border-radius: var(--sz-canva-radius);"
            >
              {{ $t('coach.book.noSlots') }}
            </p>
            <template v-else>
              <div>
                <p class="mb-2 text-start text-xs font-bold text-brand-gray-500">{{ $t('coach.book.pickCourt') }}</p>
                <div class="flex flex-wrap gap-2" role="listbox" :aria-label="$t('coach.book.pickCourt')">
                  <button
                    v-for="group in courtGroups"
                    :key="group.courtId"
                    type="button"
                    role="option"
                    class="canva-court-chip"
                    :class="group.courtId === selectedCourtId ? 'canva-court-chip-active' : 'canva-court-chip-idle'"
                    :aria-selected="group.courtId === selectedCourtId"
                    @click="selectCourt(group.courtId)"
                  >
                    {{ formatFaDigits(group.courtNameFa) }}
                  </button>
                </div>
              </div>

              <div v-if="selectedCourtGroup">
                <p class="mb-2 text-start text-xs font-bold text-brand-gray-500">{{ $t('coach.book.pickTime') }}</p>
                <div class="flex flex-col gap-2">
                  <button
                    v-for="slot in selectedCourtGroup.bookable"
                    :key="slot.id"
                    type="button"
                    class="canva-finance-tx-card"
                    :class="slot.id === selectedSlotId ? 'border-brand-primary bg-brand-primary-soft' : ''"
                    @click="selectedSlotId = slot.id"
                  >
                    <div class="min-w-0 flex-1 text-start">
                      <p class="text-sm font-bold text-brand-navy">
                        <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(slot.startTime, slot.endTime) }}</bdi>
                      </p>
                      <p class="mt-0.5 text-xs font-bold text-brand-primary" dir="auto">
                        {{ formatCurrency(slot.courtCharge) }}
                      </p>
                    </div>
                  </button>
                  <div
                    v-for="slot in selectedCourtGroup.blocked"
                    :key="`ext-${slot.id}`"
                    :class="isExternalUncertain(slot) ? 'canva-finance-tx-card border-amber-300 bg-amber-50 opacity-90' : 'canva-finance-tx-card border-brand-gray-200 bg-brand-gray-50 opacity-80'"
                    aria-disabled="true"
                  >
                    <div class="min-w-0 flex-1 text-start">
                      <p class="text-sm font-bold text-brand-gray-600">
                        <bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(slot.startTime, slot.endTime) }}</bdi>
                      </p>
                      <p class="mt-0.5 text-xs font-bold text-brand-navy">{{ externalSiteBadge(slot) }}</p>
                      <p class="text-[10px] text-brand-gray-500">{{ isExternalUncertain(slot) ? $t('coach.book.externalUncertainHint') : $t('coach.book.externalOccupiedHint') }}</p>
                    </div>
                  </div>
                </div>
                <p
                  v-if="!selectedCourtGroup.bookable.length && !selectedCourtGroup.blocked.length"
                  class="border border-dashed border-brand-gray-200 bg-brand-cream px-3 py-8 text-center text-sm text-brand-gray-500"
                  style="border-radius: var(--sz-canva-radius);"
                >
                  {{ $t('coach.book.noSlots') }}
                </p>
              </div>
            </template>
          </section>
        </div>
      </AppAsyncState>

      <section v-if="fromCalendar || clubs.length" class="canva-panel space-y-3">
            <AppFormField :label="$t('coach.book.studentPhone')">
              <div class="relative" :class="studentSearchOpen && studentSearchSource === 'mobile' ? 'z-30' : ''">
                <input
                  v-model="studentPhone"
                  type="tel"
                  dir="ltr"
                  inputmode="tel"
                  autocomplete="off"
                  class="neo-input tabular-nums"
                  :aria-expanded="studentSearchOpen && studentSearchSource === 'mobile'"
                  aria-autocomplete="list"
                  aria-controls="coach-book-student-suggestions-mobile"
                  @input="onStudentPhoneInput"
                  @focus="onStudentPhoneInput"
                  @blur="closeStudentSearchSoon"
                >
                <OwnerGuestSearchDropdown
                  list-id="coach-book-student-suggestions-mobile"
                  :open="studentSearchOpen && studentSearchSource === 'mobile'"
                  :pending="studentSearchPending"
                  :suggestions="studentSuggestions"
                  @select="selectStudentSuggestion"
                />
              </div>
            </AppFormField>
            <AppFormField :label="$t('coach.book.studentName')">
              <div class="relative" :class="studentSearchOpen && studentSearchSource === 'name' ? 'z-30' : ''">
                <input
                  v-model="studentName"
                  type="text"
                  autocomplete="off"
                  class="neo-input"
                  :aria-expanded="studentSearchOpen && studentSearchSource === 'name'"
                  aria-autocomplete="list"
                  aria-controls="coach-book-student-suggestions-name"
                  @input="onStudentNameInput"
                  @focus="onStudentNameInput"
                  @blur="closeStudentSearchSoon"
                >
                <OwnerGuestSearchDropdown
                  list-id="coach-book-student-suggestions-name"
                  :open="studentSearchOpen && studentSearchSource === 'name'"
                  :pending="studentSearchPending"
                  :suggestions="studentSuggestions"
                  @select="selectStudentSuggestion"
                />
              </div>
            </AppFormField>

            <div v-if="fromCalendar" class="space-y-2 border-t border-brand-gray-100 pt-3 text-sm">
              <p v-if="coachProfile" class="flex justify-between gap-2 text-start">
                <span class="text-brand-gray-600">{{ $t('coach.book.studentPays') }}</span>
                <span class="font-bold text-brand-navy tabular-nums" dir="auto">{{ formatCurrency(coachProfile.sessionPrice) }}</span>
              </p>
              <p class="text-start text-xs text-brand-gray-600">{{ $t('coach.book.addStudentNoCourt') }}</p>
            </div>
            <div v-else-if="selectedSlot" class="space-y-2 border-t border-brand-gray-100 pt-3 text-sm">
              <p class="flex justify-between gap-2 text-start">
                <span class="text-brand-gray-600">{{ $t('coach.book.studentPays') }}</span>
                <span class="font-bold text-brand-navy tabular-nums" dir="auto">{{ formatCurrency(slotData?.sessionPrice || 0) }}</span>
              </p>
              <p class="flex justify-between gap-2 text-start">
                <span class="text-brand-gray-600">{{ $t('coach.book.youPay') }}</span>
                <span class="font-bold text-brand-navy tabular-nums" dir="auto">{{ formatCurrency(selectedSlot.courtCharge) }}</span>
              </p>
              <p v-if="shortfall > 0" class="venus-alert-error p-2 text-xs text-start" dir="auto">
                {{ $t('coach.book.prefundHint', { amount: formatCurrency(shortfall) }) }}
              </p>
            </div>

            <p v-if="errorKey" class="venus-alert-error p-3 text-start text-sm">{{ $t(errorKey) }}</p>
            <p
              v-if="successMessage"
              class="border border-green-200 bg-green-50 p-3 text-start text-sm text-green-700"
              style="border-radius: var(--sz-canva-radius);"
              dir="auto"
            >
              {{ successMessage }}
            </p>

            <button
              type="button"
              class="canva-gate-btn-primary"
              :class="{ 'canva-cta-busy': submitting }"
              :disabled="!canSubmit"
              :aria-busy="submitting"
              @click="submit"
            >
              {{ submitting ? $t('common.loading') : (fromCalendar ? $t('coach.book.addStudentConfirm') : $t('coach.book.confirm')) }}
            </button>
          </section>
    </div>
  </div>
</template>
