<script setup lang="ts">
import { PERSIAN_MONTHS, isoToJalaali } from '#shared/jalali.ts'
import { applyDiscountPercent, normalizeDiscountCode } from '#shared/discountCode.ts'

export type ConfirmSlot = {
  id: string
  startTime: string
  endTime?: string
  price?: number
}

export type ConfirmEquipment = {
  id: string
  nameFa: string
  nameEn: string
  price: number
}

const props = defineProps<{
  open: boolean
  clubId?: string
  clubName: string
  locationLine?: string
  sportLabel?: string
  ratingDisplay?: string
  date: string
  courtId?: string
  courtLabel?: string
  slots: ConfirmSlot[]
  rentalEquipment?: ConfirmEquipment | null
}>()

const emit = defineEmits<{
  close: []
  success: []
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const { formatCurrency, formatNumber, formatWeekday } = useFormatters()
const { localizedField } = useLocalizedField()
const { fetchErrorMessage } = useFetchError()
const { user } = useAuth()
const {
  confirming,
  paying,
  feedback,
  feedbackTone,
  done,
  onlineEnabled,
  resetBookingState,
  gateGuestAuth,
  createCourtBookings,
  primaryCtaLabel,
  walletCoversAmount,
} = useCourtBooking()

const wantRacket = ref(false)
const discountInput = ref('')
const discountApplying = ref(false)
const discountError = ref('')
const appliedDiscount = ref<{
  code: string
  percent: number
  discountAmount: number
} | null>(null)

const racketItem = computed(() => props.rentalEquipment || null)

const dateHeading = computed(() => {
  if (!props.date) return ''
  const j = isoToJalaali(props.date)
  const weekday = formatWeekday(props.date, 'long')
  return `${weekday} ${formatNumber(j.jd)} ${PERSIAN_MONTHS[j.jm - 1]}`
})

const costLines = computed(() => {
  const lines: Array<{ label: string; amount: number }> = []
  for (const slot of props.slots) {
    const time = slot.startTime?.slice(0, 5) || ''
    lines.push({
      label: t('booking.confirmLineSlot', { date: dateHeading.value, time }),
      amount: Number(slot.price || 0),
    })
  }
  if (wantRacket.value && racketItem.value) {
    // Qty is always 1: BookingEquipment is unique per (booking, equipment).
    const name = localizedField(racketItem.value, 'nameFa', 'nameEn')
    lines.push({
      label: t('booking.confirmLineEquipment', { name, qty: formatNumber(1) }),
      amount: Number(racketItem.value.price || 0),
    })
  }
  return lines
})

const subtotalAmount = computed(() => costLines.value.reduce((sum, line) => sum + line.amount, 0))

const discountAmount = computed(() => {
  if (!appliedDiscount.value) return 0
  return applyDiscountPercent(subtotalAmount.value, appliedDiscount.value.percent).discountAmount
})

const totalAmount = computed(() => Math.max(0, subtotalAmount.value - discountAmount.value))

const showWalletCta = computed(() =>
  Boolean(user.value) && walletCoversAmount(totalAmount.value),
)

const metaLine = computed(() => {
  const parts = [props.locationLine, props.sportLabel].filter(Boolean)
  return parts.join(' | ')
})

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    resetBookingState()
    wantRacket.value = false
    discountInput.value = ''
    discountError.value = ''
    appliedDiscount.value = null
  }
})

watch([wantRacket, () => props.slots], () => {
  // Recompute applied discount amount when line items change; keep code if still applied.
  if (!appliedDiscount.value) return
  const next = applyDiscountPercent(subtotalAmount.value, appliedDiscount.value.percent)
  appliedDiscount.value = {
    ...appliedDiscount.value,
    discountAmount: next.discountAmount,
  }
})

function close() {
  emit('close')
}

function clearDiscount() {
  appliedDiscount.value = null
  discountError.value = ''
}

async function applyDiscount() {
  if (discountApplying.value || confirming.value || paying.value) return
  const code = normalizeDiscountCode(discountInput.value)
  if (!code) {
    discountError.value = t('booking.discountRequired')
    appliedDiscount.value = null
    return
  }
  if (!props.clubId) {
    discountError.value = t('booking.discountApplyFailed')
    return
  }
  discountApplying.value = true
  discountError.value = ''
  try {
    const result = await $fetch<{
      code: string
      percent: number
      discountAmount: number
    }>('/api/discounts/validate', {
      method: 'POST',
      body: {
        code,
        clubId: props.clubId,
        subtotal: subtotalAmount.value,
      },
    })
    appliedDiscount.value = {
      code: result.code,
      percent: result.percent,
      discountAmount: result.discountAmount,
    }
    discountInput.value = result.code
  }
  catch (error: unknown) {
    appliedDiscount.value = null
    discountError.value = fetchErrorMessage(error, t('booking.discountInvalid'))
  }
  finally {
    discountApplying.value = false
  }
}

async function submit(preferWallet = false) {
  if (!props.slots.length || confirming.value || paying.value) return

  // Guest: close confirm sheet first so AuthFlow is not buried under z-50 twin modal.
  if (!user.value) {
    const slotIds = props.slots.map((s) => s.id)
    emit('close')
    await nextTick()
    gateGuestAuth({
      date: props.date,
      courtId: props.courtId,
      slotIds,
    })
    return
  }

  const equipmentIds = wantRacket.value && racketItem.value ? [racketItem.value.id] : []
  const result = await createCourtBookings({
    slotIds: props.slots.map((s) => s.id),
    equipmentIds,
    discountCode: appliedDiscount.value?.code,
    date: props.date,
    courtId: props.courtId,
    preferWallet,
  })
  if (result) {
    emit('success')
  }
}
</script>

<template>
  <AppModal
    :open="open"
    sheet
    patterned
    max-width-class="canva-phone-shell max-w-sm"
    @close="close"
  >
    <div class="canva-confirm-book">
      <div class="canva-auth-header">
        <button type="button" class="text-xs font-bold text-brand-gray-600" @click="close">
          {{ t('common.close') }}
        </button>
        <div class="flex items-center gap-2">
          <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7" />
          <span class="font-display text-base font-bold tracking-wide text-brand-navy">INBOX</span>
        </div>
        <span class="w-8" aria-hidden="true" />
      </div>

      <div class="canva-auth-body space-y-3 px-5 pb-6 pt-1">
        <template v-if="done && !onlineEnabled">
          <p class="text-center text-base font-bold text-brand-primary">✓ {{ feedback || t('booking.successCourt') }}</p>
          <NuxtLink :to="localePath('/athlete/bookings')" class="canva-cta canva-confirm-book-cta w-full">
            {{ t('booking.viewBookings') }}
          </NuxtLink>
          <button type="button" class="canva-gate-btn-secondary w-full" @click="close">
            {{ t('common.close') }}
          </button>
        </template>

        <template v-else>
          <div class="text-center">
            <p class="canva-confirm-book-title">{{ t('booking.confirmFinalTitle') }}</p>
            <h2 class="mt-1 text-xl font-bold text-brand-navy">{{ clubName }}</h2>
            <p v-if="metaLine || (ratingDisplay && ratingDisplay !== '—')" class="mt-1 flex flex-wrap items-center justify-center gap-1 text-xs text-brand-gray-600">
              <span v-if="metaLine">{{ metaLine }}</span>
              <template v-if="ratingDisplay && ratingDisplay !== '—'">
                <span v-if="metaLine">|</span>
                <span class="tabular-nums text-brand-navy">{{ ratingDisplay }}</span>
                <span class="canva-court-card-star text-amber-400" aria-hidden="true">★</span>
              </template>
            </p>
          </div>

          <div class="text-start">
            <p class="canva-confirm-book-date">{{ dateHeading }}</p>
            <div class="mt-2 flex flex-wrap justify-start gap-2">
              <span
                v-for="slot in slots"
                :key="slot.id"
                class="canva-confirm-book-time"
              >
                {{ slot.startTime?.slice(0, 5) }}
              </span>
            </div>
            <p v-if="courtLabel" class="mt-2 flex items-center justify-start gap-2 text-xs font-bold text-brand-navy">
              <span class="canva-confirm-book-dot" aria-hidden="true" />
              {{ courtLabel }}
            </p>
          </div>

          <div v-if="racketItem" class="canva-confirm-book-equip">
            <label class="flex cursor-pointer items-center justify-between gap-3 text-start">
              <span class="flex min-w-0 items-center gap-3">
                <input v-model="wantRacket" type="checkbox" class="canva-confirm-book-check" />
                <span class="text-sm font-bold text-brand-navy">{{ t('booking.wantRacket') }}</span>
              </span>
              <span class="shrink-0 font-bold tabular-nums text-brand-navy" dir="ltr">
                {{ formatCurrency(racketItem.price) }}
              </span>
            </label>
          </div>

          <div class="canva-confirm-book-costs text-start">
            <div
              v-for="(line, idx) in costLines"
              :key="idx"
              class="flex items-start justify-between gap-3 text-xs"
            >
              <span class="text-brand-gray-600">{{ line.label }}</span>
              <span class="shrink-0 font-bold tabular-nums text-brand-navy" dir="ltr">{{ formatCurrency(line.amount) }}</span>
            </div>

            <div class="canva-confirm-book-discount">
              <label class="sr-only" for="confirm-discount">{{ t('booking.discountCode') }}</label>
              <div class="canva-confirm-book-discount-row">
                <input
                  id="confirm-discount"
                  v-model="discountInput"
                  type="text"
                  class="canva-confirm-book-discount-input"
                  :placeholder="t('booking.discountPlaceholder')"
                  :disabled="discountApplying || confirming || paying"
                  autocomplete="off"
                  @keydown.enter.prevent="applyDiscount"
                >
                <button
                  v-if="appliedDiscount"
                  type="button"
                  class="canva-confirm-book-discount-btn"
                  :disabled="discountApplying || confirming || paying"
                  @click="clearDiscount"
                >
                  {{ t('booking.discountClear') }}
                </button>
                <button
                  v-else
                  type="button"
                  class="canva-confirm-book-discount-btn"
                  :disabled="discountApplying || confirming || paying || !discountInput.trim()"
                  @click="applyDiscount"
                >
                  {{ discountApplying ? t('common.loading') : t('booking.discountApply') }}
                </button>
              </div>
              <p v-if="discountError" class="canva-confirm-book-discount-note text-brand-primary">{{ discountError }}</p>
              <p v-else-if="appliedDiscount" class="canva-confirm-book-discount-note text-brand-navy">
                {{ t('booking.discountApplied', {
                  code: appliedDiscount.code,
                  percent: formatNumber(appliedDiscount.percent),
                }) }}
              </p>
            </div>

            <div
              v-if="appliedDiscount && discountAmount > 0"
              class="flex items-start justify-between gap-3 text-xs"
            >
              <span class="text-brand-gray-600">{{ t('booking.confirmLineDiscount', {
                code: appliedDiscount.code,
                percent: formatNumber(appliedDiscount.percent),
              }) }}</span>
              <span class="shrink-0 font-bold tabular-nums text-brand-primary" dir="ltr">−{{ formatCurrency(discountAmount) }}</span>
            </div>

            <div class="flex items-center justify-between gap-3 border-t border-brand-gray-200 pt-2 text-sm font-bold text-brand-navy">
              <span>{{ t('booking.costTotalShort') }}</span>
              <span class="tabular-nums" dir="ltr">{{ formatCurrency(totalAmount) }}</span>
            </div>
          </div>

          <p v-if="feedback && feedbackTone === 'error'" class="canva-flash-error text-start text-xs">{{ feedback }}</p>

          <p class="text-center text-[11px] text-brand-gray-600">
            {{ t('booking.acceptTerms') }}
            <NuxtLink :to="localePath('/terms')" class="font-bold text-brand-primary underline">{{ t('legal.terms') }}</NuxtLink>
          </p>

          <button
            v-if="showWalletCta"
            type="button"
            class="canva-cta canva-confirm-book-cta w-full"
            :disabled="!slots.length || confirming || paying"
            @click="submit(true)"
          >
            {{ confirming || paying ? t('common.loading') : t('booking.payFromWallet') }}
          </button>
          <button
            type="button"
            class="canva-confirm-book-cta w-full"
            :class="showWalletCta ? 'canva-gate-btn-secondary' : 'canva-cta'"
            :disabled="!slots.length || confirming || paying"
            @click="submit(false)"
          >
            {{ primaryCtaLabel }}
          </button>
        </template>
      </div>
    </div>
  </AppModal>
</template>
