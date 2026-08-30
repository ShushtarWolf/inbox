<script setup lang="ts">
import { WALLET_TOPUP_MAX_IRR, WALLET_TOPUP_MIN_IRR } from '#shared/walletTopUp.ts'
import { fetchErrorMessage } from '~/composables/useFetchError'

definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH', ssr: false })

const { t } = useI18n()
const { formatCurrency, formatTimeRange, formatNumber, formatFaDigits } = useFormatters()
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

const initialDate = typeof route.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(route.query.date)
  ? route.query.date
  : today()
const initialTime = typeof route.query.time === 'string' ? route.query.time.slice(0, 5) : ''

const { data: clubLinks, pending, error } = await useAuthedFetch<{
  links: Array<{ id: string; status: 'PENDING' | 'ACTIVE' | 'BLOCKED'; courtDiscountPercent: number; club: ClubOption }>
}>('/api/coach/clubs')
const { data: wallet, refresh: refreshWallet } = await useAuthedFetch<{ balance: number }>('/api/wallet')

const activeLinks = computed(() => (clubLinks.value?.links || []).filter((link) => link.status === 'ACTIVE'))

// Club links already resolved above, so the first club is known before the slot query is built.
const clubId = ref(activeLinks.value[0]?.club.id || '')
const date = ref(initialDate)
const selectedSlotId = ref('')
const studentPhone = ref('')
const studentName = ref('')
const submitting = ref(false)
const errorKey = ref('')
const successMessage = ref('')

const { data: slotData, pending: slotsPending, refresh: refreshSlots } = await useAuthedFetch<{
  discountPercent: number
  sessionPrice: number
  slots: CourtSlot[]
}>('/api/coach/court-slots', {
  query: computed(() => ({ clubId: clubId.value, date: date.value })),
  immediate: Boolean(clubId.value),
})

const {
  isExternalOnlyOccupied,
  externalSiteBadge,
  refreshExternalOverlay,
} = useCoachExternalCalendarOverlay({ clubId, date })

const bookableSlots = computed(() =>
  (slotData.value?.slots || []).filter((slot) => !isExternalOnlyOccupied(slot)),
)

const blockedExternalSlots = computed(() =>
  (slotData.value?.slots || []).filter((slot) => isExternalOnlyOccupied(slot)),
)

watch(slotData, (next) => {
  if (!next?.slots?.length || selectedSlotId.value || !initialTime) return
  const match = next.slots.find((slot) =>
    slot.startTime.slice(0, 5) === initialTime && !isExternalOnlyOccupied(slot),
  )
  if (match) selectedSlotId.value = match.id
}, { immediate: true })

const selectedSlot = computed(() => (slotData.value?.slots || []).find((slot) => slot.id === selectedSlotId.value) || null)
const canSubmit = computed(() => Boolean(selectedSlot.value && studentPhone.value.trim() && !submitting.value))
const shortfall = computed(() =>
  selectedSlot.value ? Math.max(0, selectedSlot.value.courtCharge - (wallet.value?.balance || 0)) : 0,
)

watch([clubId, date], () => {
  selectedSlotId.value = ''
  errorKey.value = ''
  successMessage.value = ''
})

async function refreshSlotsAndOverlay() {
  await Promise.all([refreshSlots(), refreshExternalOverlay()])
}

/** Server statusMessages are stable identifiers; map them so the coach sees why it failed. */
function messageToKey(message: string) {
  if (message.includes('Insufficient wallet balance')) return 'coach.book.errorInsufficient'
  if (message.includes('Slot not available')) return 'coach.book.errorSlotTaken'
  if (message.includes('already booked')) return 'coach.book.errorCoachBusy'
  if (message.includes('COACH_CLUB_LINK_NOT_ACTIVE')) return 'coach.book.errorLinkInactive'
  if (message.includes('COACH_NOT_APPROVED')) return 'coach.book.errorNotApproved'
  if (message.includes('own student')) return 'coach.book.errorSelfStudent'
  return 'coach.book.errorGeneric'
}

async function submit() {
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
    await Promise.all([refreshSlotsAndOverlay(), refreshWallet()])
  }
  catch (err) {
    errorKey.value = messageToKey(String((err as { statusMessage?: string })?.statusMessage || ''))
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
  <div class="tail-page-stack">
    <h1 class="tail-page-title">{{ $t('coach.book.title') }}</h1>
    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
      <p class="text-sm text-brand-gray-600">{{ $t('coach.book.subtitle') }}</p>

      <div class="ios-card space-y-3 p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs text-brand-gray-600">{{ $t('coach.book.walletBalance') }}</p>
            <p class="font-bold" dir="auto">{{ formatCurrency(wallet?.balance || 0) }}</p>
          </div>
          <button type="button" class="text-sm font-bold text-brand-primary" @click="topUpOpen ? topUpOpen = false : openTopUp()">
            {{ $t('coach.book.topUp') }}
          </button>
        </div>
        <div v-if="topUpOpen" class="space-y-2 border-t pt-3">
          <AppNumericInput v-model="topUpAmount" :min="WALLET_TOPUP_MIN_IRR" :max="WALLET_TOPUP_MAX_IRR" />
          <p v-if="topUpError" class="venus-alert-error p-2 text-xs">{{ topUpError }}</p>
          <button type="button" class="btn-secondary w-full" :disabled="topUpBusy" @click="startTopUp">
            {{ topUpBusy ? $t('common.loading') : $t('coach.book.topUpConfirm') }}
          </button>
        </div>
      </div>

      <p v-if="!activeLinks.length" class="ios-card border-dashed p-4 text-sm text-brand-gray-600">
        {{ $t('coach.book.noActiveClubs') }}
      </p>

      <div v-else class="venus-form-stack">
        <AppFormField :label="$t('coach.book.club')">
          <select v-model="clubId" class="neo-select">
            <option v-for="link in activeLinks" :key="link.id" :value="link.club.id">
              {{ formatFaDigits(link.club.nameFa) }} — {{ $t('coach.clubLinkDiscount', { percent: formatNumber(link.courtDiscountPercent) }) }}
            </option>
          </select>
        </AppFormField>

        <AppDateInput v-model="date" :label="$t('common.date')" :min-date="today" />

        <section class="space-y-2">
          <h2 class="text-sm font-bold text-brand-gray-600">{{ $t('coach.book.pickSlot') }}</h2>
          <p v-if="slotsPending" class="text-sm text-brand-gray-600">{{ $t('common.loading') }}</p>
          <p v-else-if="!slotData?.slots?.length" class="ios-card border-dashed p-4 text-sm text-brand-gray-600">
            {{ $t('coach.book.noSlots') }}
          </p>
          <p v-else-if="!bookableSlots.length && blockedExternalSlots.length" class="ios-card border-dashed p-4 text-sm text-brand-gray-600">
            {{ $t('coach.book.noSlots') }}
          </p>
          <div v-else class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="slot in bookableSlots"
              :key="slot.id"
              type="button"
              class="ios-card p-3 text-start"
              :class="slot.id === selectedSlotId ? 'border-2 border-brand-primary' : ''"
              @click="selectedSlotId = slot.id"
            >
              <p class="text-sm font-bold">{{ slot.courtNameFa }}</p>
              <p class="text-sm"><bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(slot.startTime, slot.endTime) }}</bdi></p>
              <p class="text-xs text-brand-gray-600" dir="auto">
                <span v-if="slot.courtCharge < slot.listedPrice" class="line-through">{{ formatCurrency(slot.listedPrice) }}</span>
                <span class="font-bold text-brand-primary"> {{ formatCurrency(slot.courtCharge) }}</span>
              </p>
            </button>
            <div
              v-for="slot in blockedExternalSlots"
              :key="`ext-${slot.id}`"
              class="ios-card border border-brand-gray-200 bg-brand-gray-50 p-3 text-start opacity-80"
              aria-disabled="true"
            >
              <p class="text-sm font-bold text-brand-gray-600">{{ slot.courtNameFa }}</p>
              <p class="text-sm text-brand-gray-600"><bdi dir="ltr" class="tabular-nums">{{ formatTimeRange(slot.startTime, slot.endTime) }}</bdi></p>
              <p class="mt-1 text-xs font-bold text-brand-navy">{{ externalSiteBadge(slot) }}</p>
              <p class="text-[10px] text-brand-gray-500">{{ $t('coach.book.externalOccupiedHint') }}</p>
            </div>
          </div>
        </section>

        <AppFormField :label="$t('coach.book.studentPhone')">
          <input v-model="studentPhone" type="tel" dir="ltr" inputmode="tel" class="neo-input tabular-nums" />
        </AppFormField>
        <AppFormField :label="$t('coach.book.studentName')">
          <input v-model="studentName" type="text" class="neo-input" />
        </AppFormField>

        <div v-if="selectedSlot" class="ios-card space-y-1 p-4 text-sm">
          <p class="flex justify-between gap-2">
            <span>{{ $t('coach.book.studentPays') }}</span>
            <span class="font-bold" dir="auto">{{ formatCurrency(slotData?.sessionPrice || 0) }}</span>
          </p>
          <p class="flex justify-between gap-2">
            <span>{{ $t('coach.book.youPay') }}</span>
            <span class="font-bold" dir="auto">{{ formatCurrency(selectedSlot.courtCharge) }}</span>
          </p>
          <p v-if="shortfall > 0" class="venus-alert-error p-2 text-xs" dir="auto">
            {{ $t('coach.book.prefundHint', { amount: formatCurrency(shortfall) }) }}
          </p>
        </div>

        <p v-if="errorKey" class="venus-alert-error p-3 text-sm">{{ $t(errorKey) }}</p>
        <p v-if="successMessage" class="ios-card p-3 text-sm text-green-700" dir="auto">{{ successMessage }}</p>

        <button type="button" class="btn-primary w-full" :disabled="!canSubmit" @click="submit">
          {{ submitting ? $t('common.loading') : $t('coach.book.confirm') }}
        </button>
      </div>
    </AppAsyncState>
  </div>
</template>
