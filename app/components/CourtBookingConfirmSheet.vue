<script setup lang="ts">
import { PERSIAN_MONTHS, isoToJalaali } from '#shared/jalali.ts'
import { applyDiscountPercent, normalizeDiscountCode } from '#shared/discountCode.ts'
import { computeBookingPrice, computeListedSlotPrice } from '#shared/courtPricing.ts'
import {
  minAvailableEquipmentAcrossTimes,
  normalizeSlotTime,
} from '#shared/equipmentAvailability.ts'

export type ConfirmSlot = {
  id: string
  startTime: string
  endTime?: string
  price?: number
  /** Live Court.price — preferred over slot.price for the confirm total. */
  courtPrice?: number
  courtId?: string
  courtLabel?: string
  /** Court pricingJson — used so owner last-second discount matches IPG. */
  pricingJson?: string | null
}

export type ConfirmEquipment = {
  id: string
  nameFa: string
  nameEn: string
  price: number
  quantity?: number
  category?: 'RENTAL' | 'SELL' | 'SERVICE' | 'CLUB'
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
  bookableEquipment?: ConfirmEquipment[]
}>()

const emit = defineEmits<{
  close: []
  success: []
  slotConflict: []
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const { formatCurrency, formatNumber, formatWeekday, formatTimeLabel } = useFormatters()
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

const equipmentQuantities = ref<Record<string, number>>({})
const equipmentAvailability = ref<Record<string, number>>({})
const availabilityLoading = ref(false)
const discountInput = ref('')
const discountApplying = ref(false)
const discountError = ref('')
const appliedDiscount = ref<{
  code: string
  percent: number
  discountAmount: number
} | null>(null)

const visibleEquipment = computed(() =>
  (props.bookableEquipment || []).filter((item) => equipmentStock(item) > 0),
)

function equipmentCatalogStock(item: ConfirmEquipment) {
  return Math.max(0, Number(item.quantity ?? 1))
}

function equipmentStock(item: ConfirmEquipment) {
  const live = equipmentAvailability.value[item.id]
  if (live != null) return Math.max(0, live)
  return equipmentCatalogStock(item)
}

async function refreshEquipmentAvailability() {
  if (!props.open || !props.clubId || !props.date || !props.slots.length) {
    equipmentAvailability.value = {}
    return
  }
  const equipmentIds = (props.bookableEquipment || []).map((item) => item.id)
  if (!equipmentIds.length) {
    equipmentAvailability.value = {}
    return
  }
  const startTimes = uniqueOrdered(
    props.slots.map((slot) => normalizeSlotTime(slot.startTime)).filter(Boolean),
  )
  availabilityLoading.value = true
  try {
    const result = await $fetch<{ available: Record<string, number> }>('/api/equipment/availability', {
      method: 'POST',
      body: {
        clubId: props.clubId,
        date: props.date,
        startTimes,
        equipmentIds,
      },
    })
    equipmentAvailability.value = result.available || {}
  }
  catch {
    equipmentAvailability.value = {}
  }
  finally {
    availabilityLoading.value = false
  }
}

function equipmentQty(id: string) {
  return Math.max(0, equipmentQuantities.value[id] || 0)
}

function bumpEquipment(id: string, delta: number) {
  const item = visibleEquipment.value.find((row) => row.id === id)
  if (!item) return
  const max = equipmentStock(item)
  if (max < 1) return
  const next = Math.min(max, Math.max(0, equipmentQty(id) + delta))
  if (next <= 0) {
    const quantities = { ...equipmentQuantities.value }
    delete quantities[id]
    equipmentQuantities.value = quantities
    return
  }
  equipmentQuantities.value = { ...equipmentQuantities.value, [id]: next }
}

const selectedEquipmentIds = computed(() =>
  Object.entries(equipmentQuantities.value)
    .filter(([, qty]) => qty > 0)
    .map(([id]) => id),
)

const dateHeading = computed(() => {
  if (!props.date) return ''
  const j = isoToJalaali(props.date)
  const weekday = formatWeekday(props.date, 'long')
  return `${weekday} ${formatNumber(j.jd)} ${PERSIAN_MONTHS[j.jm - 1]}`
})

const costLines = computed(() => {
  const lines: Array<{ label: string; amount: number }> = []
  for (const slot of props.slots) {
    const time = formatTimeLabel(slot.startTime || '')
    const listed = slot.courtPrice != null && slot.startTime
      ? computeListedSlotPrice(Number(slot.courtPrice), slot.startTime, slot.pricingJson)
      : Number(slot.price || 0)
    const amount = props.date && slot.startTime
      ? computeBookingPrice(listed, slot.pricingJson, props.date, slot.startTime)
      : listed
    lines.push({
      label: slot.courtLabel
        ? t('booking.confirmLineSlotCourt', { court: slot.courtLabel, time })
        : t('booking.confirmLineSlot', { date: dateHeading.value, time }),
      amount,
    })
  }
  for (const item of visibleEquipment.value) {
    const qty = equipmentQty(item.id)
    if (qty < 1) continue
    const name = localizedField(item, 'nameFa', 'nameEn')
    lines.push({
      label: t('booking.confirmLineEquipment', { name, qty: formatNumber(qty) }),
      amount: Number(item.price || 0) * qty,
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
    equipmentQuantities.value = {}
    equipmentAvailability.value = {}
    discountInput.value = ''
    discountError.value = ''
    appliedDiscount.value = null
    refreshEquipmentAvailability()
  }
})

watch(
  () => [props.slots.map((slot) => slot.id).join(','), props.date, props.bookableEquipment?.map((item) => item.id).join(',')],
  () => {
    if (!props.open) return
    refreshEquipmentAvailability()
  },
)

watch(equipmentAvailability, (available) => {
  const next = { ...equipmentQuantities.value }
  let changed = false
  for (const [id, qty] of Object.entries(next)) {
    const max = available[id]
    if (max == null) continue
    if (max < 1) {
      delete next[id]
      changed = true
    }
    else if (qty > max) {
      next[id] = max
      changed = true
    }
  }
  if (changed) equipmentQuantities.value = next
})

watch([equipmentQuantities, () => props.slots], () => {
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

  const equipmentIds = selectedEquipmentIds.value
  const quantitiesPayload = equipmentIds.length
    ? Object.fromEntries(
      equipmentIds.map((id) => [id, equipmentQty(id)]),
    )
    : undefined
  const result = await createCourtBookings({
    slotIds: props.slots.map((s) => s.id),
    equipmentIds,
    equipmentQuantities: quantitiesPayload,
    discountCode: appliedDiscount.value?.code,
    date: props.date,
    courtId: props.courtId,
    courtIds: slotCourtIds.value.length ? slotCourtIds.value : undefined,
    preferWallet,
  })
  if (result && 'conflict' in result) {
    emit('slotConflict')
    return
  }
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
        <template v-if="done && lastPaymentStatus === 'PAID'">
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
            <div
              class="mt-2 flex justify-start gap-2"
              :class="multiCourt ? 'flex-col' : 'flex-wrap'"
            >
              <span
                v-for="slot in slots"
                :key="slot.id"
                class="canva-confirm-book-time"
                :class="multiCourt ? 'w-full justify-start' : ''"
              >
                <template v-if="multiCourt && slot.courtLabel">{{ slot.courtLabel }} </template>{{ formatTimeLabel(slot.startTime || '') }}
              </span>
            </div>
            <p
              v-if="displayCourtLabel && !multiCourt"
              class="mt-2 flex items-center justify-start gap-2 text-xs font-bold text-brand-navy"
            >
              <span class="canva-confirm-book-dot" aria-hidden="true" />
              {{ displayCourtLabel }}
            </p>
          </div>

          <div v-if="visibleEquipment.length" class="space-y-2">
            <p v-if="visibleEquipment.some((item) => item.category === 'RENTAL')" class="text-start text-xs font-bold text-brand-gray-600">
              {{ t('booking.equipmentRental') }}
            </p>
            <div
              v-for="item in visibleEquipment.filter((row) => row.category === 'RENTAL')"
              :key="item.id"
              class="canva-confirm-book-equip"
            >
              <div class="flex items-center justify-between gap-3 text-start">
                <span class="min-w-0 text-sm font-bold text-brand-navy">{{ localizedField(item, 'nameFa', 'nameEn') }}</span>
                <div class="flex shrink-0 items-center gap-2">
                  <div class="canva-qty-step" role="group" :aria-label="localizedField(item, 'nameFa', 'nameEn')">
                    <button
                      type="button"
                      class="canva-qty-step-btn"
                      :disabled="equipmentQty(item.id) <= 0 || payBusy"
                      aria-label="−"
                      @click="bumpEquipment(item.id, -1)"
                    >−</button>
                    <span class="min-w-[1.25rem] text-center tabular-nums">{{ formatNumber(equipmentQty(item.id)) }}</span>
                    <button
                      type="button"
                      class="canva-qty-step-btn"
                      :disabled="equipmentQty(item.id) >= equipmentStock(item) || payBusy || availabilityLoading"
                      aria-label="+"
                      @click="bumpEquipment(item.id, 1)"
                    >+</button>
                  </div>
                  <span class="font-bold tabular-nums text-brand-navy" dir="ltr">
                    {{ formatCurrency(item.price) }}
                  </span>
                </div>
              </div>
            </div>

            <p v-if="visibleEquipment.some((item) => item.category === 'SELL')" class="text-start text-xs font-bold text-brand-gray-600">
              {{ t('booking.equipmentSell') }}
            </p>
            <div
              v-for="item in visibleEquipment.filter((row) => row.category === 'SELL')"
              :key="item.id"
              class="canva-confirm-book-equip"
            >
              <div class="flex items-center justify-between gap-3 text-start">
                <span class="min-w-0 text-sm font-bold text-brand-navy">{{ localizedField(item, 'nameFa', 'nameEn') }}</span>
                <div class="flex shrink-0 items-center gap-2">
                  <div class="canva-qty-step" role="group" :aria-label="localizedField(item, 'nameFa', 'nameEn')">
                    <button
                      type="button"
                      class="canva-qty-step-btn"
                      :disabled="equipmentQty(item.id) <= 0 || payBusy"
                      aria-label="−"
                      @click="bumpEquipment(item.id, -1)"
                    >−</button>
                    <span class="min-w-[1.25rem] text-center tabular-nums">{{ formatNumber(equipmentQty(item.id)) }}</span>
                    <button
                      type="button"
                      class="canva-qty-step-btn"
                      :disabled="equipmentQty(item.id) >= equipmentStock(item) || payBusy || availabilityLoading"
                      aria-label="+"
                      @click="bumpEquipment(item.id, 1)"
                    >+</button>
                  </div>
                  <span class="font-bold tabular-nums text-brand-navy" dir="ltr">
                    {{ formatCurrency(item.price) }}
                  </span>
                </div>
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
        <template v-if="done && lastPaymentStatus === 'PAID'">
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
