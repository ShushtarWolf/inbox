<script setup lang="ts">
import { PERSIAN_MONTHS, isoToJalaali } from '#shared/jalali.ts'
import { applyDiscountPercent, normalizeDiscountCode } from '#shared/discountCode.ts'
import { uniqueOrdered, joinWithAnd } from '#shared/courtSlotSelection.ts'

export type ConfirmSlot = {
  id: string
  startTime: string
  endTime?: string
  price?: number
  courtId?: string
  courtLabel?: string
}

export type ConfirmEquipment = {
  id: string
  nameFa: string
  nameEn: string
  price: number
  quantity?: number
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
  createdBookingId,
  lastPaymentStatus,
  resetBookingState,
  gateGuestAuth,
  createCourtBookings,
  payBooking,
  payBookingWithWallet,
  walletCoversAmount,
} = useCourtBooking()

const wantRacket = ref(false)
const racketQty = ref(0)
const discountInput = ref('')
const discountApplying = ref(false)
const discountError = ref('')
const appliedDiscount = ref<{
  code: string
  percent: number
  discountAmount: number
} | null>(null)

const racketItem = computed(() => props.rentalEquipment || null)
const racketStock = computed(() => Math.max(0, Number(racketItem.value?.quantity || 1)))

watch(racketQty, (qty) => {
  wantRacket.value = qty > 0
})

function bumpRacket(delta: number) {
  const max = racketStock.value
  if (max < 1) return
  const next = Math.min(max, Math.max(0, racketQty.value + delta))
  racketQty.value = next
}

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
      label: slot.courtLabel
        ? t('booking.confirmLineSlotCourt', { court: slot.courtLabel, time })
        : t('booking.confirmLineSlot', { date: dateHeading.value, time }),
      amount: Number(slot.price || 0),
    })
  }
  if (wantRacket.value && racketItem.value) {
    const name = localizedField(racketItem.value, 'nameFa', 'nameEn')
    const qty = racketQty.value || 1
    lines.push({
      label: t('booking.confirmLineEquipment', { name, qty: formatNumber(qty) }),
      amount: Number(racketItem.value.price || 0) * qty,
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

const slotCourtIds = computed(() =>
  uniqueOrdered(props.slots.map((s) => s.courtId).filter((id): id is string => Boolean(id))),
)
const multiCourt = computed(() => {
  const labels = uniqueOrdered(props.slots.map((s) => s.courtLabel).filter((label): label is string => Boolean(label)))
  return labels.length > 1 || slotCourtIds.value.length > 1
})
const displayCourtLabel = computed(() => {
  const labels = uniqueOrdered(props.slots.map((s) => s.courtLabel).filter((label): label is string => Boolean(label)))
  return labels.length ? joinWithAnd(labels) : (props.courtLabel || '')
})

const metaLine = computed(() => {
  const parts = [props.locationLine, props.sportLabel].filter(Boolean)
  return parts.join(' | ')
})

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    resetBookingState()
    wantRacket.value = false
    racketQty.value = 0
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

const payBusy = computed(() => confirming.value || paying.value)

const payCtaLabel = computed(() => {
  if (paying.value) return t('booking.redirectingToGateway')
  if (confirming.value) return t('common.loading')
  if (!user.value) return t('booking.loginToContinue')
  if (feedbackTone.value === 'error' && createdBookingId.value) return t('booking.payRetry')
  return t('booking.pay')
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
      courtIds: slotCourtIds.value.length ? slotCourtIds.value : undefined,
      slotIds,
    })
    return
  }

  // Booking already created (checkout failed or SEP handshake stalled) — re-checkout only.
  if (createdBookingId.value) {
    if (preferWallet) await payBookingWithWallet(createdBookingId.value)
    else await payBooking(createdBookingId.value)
    return
  }

  const equipmentIds = wantRacket.value && racketItem.value && racketQty.value > 0
    ? [racketItem.value.id]
    : []
  const equipmentQuantities = equipmentIds.length && racketItem.value
    ? { [racketItem.value.id]: racketQty.value }
    : undefined
  const result = await createCourtBookings({
    slotIds: props.slots.map((s) => s.id),
    equipmentIds,
    equipmentQuantities,
    discountCode: appliedDiscount.value?.code,
    date: props.date,
    courtId: props.courtId,
    courtIds: slotCourtIds.value.length ? slotCourtIds.value : undefined,
    preferWallet,
  })
  if (!result) return
  // Still on-page after online checkout means stall/error — keep slots so Pay can retry.
  if (onlineEnabled.value && lastPaymentStatus.value !== 'PAID') return
  emit('success')
}
</script>

<template>
  <AppModal
    :open="open"
    sheet
    patterned
    max-width-class="max-w-sm min-[431px]:max-w-lg"
    @close="close"
  >
    <div class="canva-confirm-book flex min-h-0 flex-1 flex-col overflow-hidden">
      <!-- LOCKED #5: logo RIGHT / close LEFT (RTL flex order) -->
      <div class="canva-auth-header shrink-0">
        <NuxtLink
          :to="localePath('/')"
          class="flex items-center gap-2"
          :aria-label="t('brand.name')"
          @click="close"
        >
          <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7" />
          <InboxWordmark class="text-base text-brand-navy" />
        </NuxtLink>
        <button type="button" class="inline-flex items-center gap-1 text-xs font-bold text-brand-gray-600" @click="close">
          <AppIcon name="close" size="sm" />
          {{ t('common.close') }}
        </button>
      </div>

      <div class="canva-auth-body min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 pb-4 pt-1">
        <template v-if="done && (!onlineEnabled || lastPaymentStatus === 'PAID')">
          <p class="text-center text-base font-bold text-brand-primary">✓ {{ feedback || t('booking.successCourt') }}</p>
        </template>

        <template v-else>
          <div class="text-center">
            <p class="canva-confirm-book-title">{{ t('booking.confirmFinalTitle') }}</p>
            <!-- Canva (4): club name under green confirm title is red -->
            <h2 class="mt-1 text-xl font-bold text-brand-primary">{{ clubName }}</h2>
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
                <template v-if="multiCourt && slot.courtLabel">{{ slot.courtLabel }} </template>{{ slot.startTime?.slice(0, 5) }}
              </span>
            </div>
            <p v-if="displayCourtLabel" class="mt-2 flex items-center justify-start gap-2 text-xs font-bold text-brand-navy">
              <span class="canva-confirm-book-dot" aria-hidden="true" />
              {{ displayCourtLabel }}
            </p>
          </div>

          <div v-if="racketItem && racketStock > 0" class="canva-confirm-book-equip">
            <div class="flex items-center justify-between gap-3 text-start">
              <span class="min-w-0 text-sm font-bold text-brand-navy">{{ t('booking.wantRacket') }}</span>
              <div class="flex shrink-0 items-center gap-2">
                <div class="canva-qty-step" role="group" :aria-label="t('booking.wantRacket')">
                  <button
                    type="button"
                    class="canva-qty-step-btn"
                    :disabled="racketQty <= 0 || payBusy"
                    aria-label="−"
                    @click="bumpRacket(-1)"
                  >−</button>
                  <span class="min-w-[1.25rem] text-center tabular-nums">{{ formatNumber(racketQty) }}</span>
                  <button
                    type="button"
                    class="canva-qty-step-btn"
                    :disabled="racketQty >= racketStock || payBusy"
                    aria-label="+"
                    @click="bumpRacket(1)"
                  >+</button>
                </div>
                <span class="font-bold tabular-nums text-brand-navy" dir="ltr">
                  {{ formatCurrency(racketItem.price) }}
                </span>
              </div>
            </div>
          </div>

          <div class="canva-confirm-book-costs text-start">
            <div
              v-for="(line, idx) in costLines"
              :key="idx"
              class="canva-confirm-book-cost-row"
            >
              <span class="canva-confirm-book-cost-label">{{ line.label }}</span>
              <span class="canva-confirm-book-cost-amount" dir="ltr">{{ formatCurrency(line.amount) }}</span>
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
                  :disabled="discountApplying || payBusy"
                  autocomplete="off"
                  @keydown.enter.prevent="applyDiscount"
                >
                <button
                  v-if="appliedDiscount"
                  type="button"
                  class="canva-confirm-book-discount-btn"
                  :disabled="discountApplying || payBusy"
                  @click="clearDiscount"
                >
                  {{ t('booking.discountClear') }}
                </button>
                <button
                  v-else
                  type="button"
                  class="canva-confirm-book-discount-btn"
                  :disabled="discountApplying || payBusy || !discountInput.trim()"
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
              class="canva-confirm-book-cost-row"
            >
              <span class="canva-confirm-book-cost-label">{{ t('booking.confirmLineDiscount', {
                code: appliedDiscount.code,
                percent: formatNumber(appliedDiscount.percent),
              }) }}</span>
              <span class="canva-confirm-book-cost-amount text-brand-primary" dir="ltr">−{{ formatCurrency(discountAmount) }}</span>
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
        </template>
      </div>

      <div class="shrink-0 space-y-2 px-5 pb-6">
        <template v-if="done && (!onlineEnabled || lastPaymentStatus === 'PAID')">
          <NuxtLink :to="localePath('/athlete/bookings')" class="canva-cta canva-confirm-book-cta w-full">
            {{ t('booking.viewBookings') }}
          </NuxtLink>
          <button type="button" class="canva-gate-btn-secondary w-full" @click="close">
            {{ t('common.close') }}
          </button>
        </template>
        <template v-else>
          <button
            type="button"
            class="canva-cta canva-confirm-book-cta w-full"
            :class="{ 'canva-cta-busy': payBusy }"
            :disabled="!slots.length"
            :aria-busy="payBusy"
            @click="submit(false)"
          >
            {{ payCtaLabel }}
          </button>
          <button
            v-if="showWalletCta"
            type="button"
            class="canva-gate-btn-secondary canva-confirm-book-cta w-full"
            :class="{ 'canva-cta-busy': payBusy }"
            :disabled="!slots.length"
            :aria-busy="payBusy"
            @click="submit(true)"
          >
            {{ payBusy ? t('common.loading') : t('booking.payFromWallet') }}
          </button>
        </template>
      </div>
    </div>
  </AppModal>
</template>
