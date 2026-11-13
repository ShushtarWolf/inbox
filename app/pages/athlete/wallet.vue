<script setup lang="ts">
import { WALLET_TOPUP_PRESETS_IRR, WALLET_TOPUP_MIN_IRR, WALLET_TOPUP_MAX_IRR } from '#shared/walletTopUp.ts'
import { isValidSheba } from '#shared/settlement.ts'

definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const { formatCurrency, formatDate, formatTimeLabel, formatNumber } = useFormatters()
const { onlineEnabled, isTestPayments, redirectToPaymentGateway } = useCheckout()
const { fetchErrorMessage } = useFetchError()
type AthleteCashDesk = {
  inTill?: number
  returnsOwed?: number
  returnsOwedCount?: number
  returnsReturned?: number
  returnsReturnedCount?: number
  recent?: Array<{
    id: string
    amount: number
    status: string
    deskCashReturn: 'owed' | 'returned' | null
    clubName: string | null
    date: string | null
    startTime: string | null
    title: string | null
  }>
}

const { data, pending, error, refresh } = await useAuthedFetch<{
  balance?: number
  availableBalance?: number
  lockedBalance?: number
  withdrawableBalance?: number
  pendingClassBalance?: number
  canBankWithdraw?: boolean
  bankWithdrawKind?: 'coach' | 'athlete' | null
  dualWithdrawRails?: boolean
  athleteWithdrawMin?: number
  sheba?: string | null
  shebaUiStatus?: 'none' | 'pending' | 'rejected' | 'active'
  pendingShebaRequest?: { proposedSheba: string | null; adminNote?: string | null } | null
  lastShebaRejection?: { adminNote?: string | null } | null
  online?: { availableBalance?: number; lockedBalance?: number }
  cashDesk?: AthleteCashDesk
  pendingWithdraws?: Array<{ id: string; amount: number }>
  transactions?: Array<{
    id: string
    type?: string
    amount: number
    createdAt: string
    note?: string | null
    refundChannelKey?: string | null
  }>
}>('/api/wallet')

const selectedPreset = ref<number | null>(null)
const customAmount = ref<number | null>(null)
const toppingUp = ref(false)
const flash = ref('')
const flashTone = ref<'success' | 'error'>('success')

const shebaInput = ref('')
const withdrawAmount = ref<number | null>(null)
const payoutBusy = ref(false)

const presets = WALLET_TOPUP_PRESETS_IRR

watch(data, (value) => {
  if (value?.pendingShebaRequest?.proposedSheba) {
    shebaInput.value = value.pendingShebaRequest.proposedSheba
  } else if (value?.pendingShebaRequest?.proposedSheba === null && value.pendingShebaRequest) {
    shebaInput.value = ''
  } else if (value?.sheba) {
    shebaInput.value = value.sheba
  }
}, { immediate: true })

const shebaStatusMessage = computed(() => {
  const status = data.value?.shebaUiStatus
  if (status === 'pending') return t('athlete.shebaPendingApproval')
  if (status === 'rejected') {
    const note = data.value?.lastShebaRejection?.adminNote
    return note ? t('athlete.shebaRejectedWithNote', { note }) : t('athlete.shebaRejected')
  }
  if (status === 'active') return t('athlete.shebaActive')
  return ''
})

const topUpAmount = computed(() => {
  if (selectedPreset.value != null) return selectedPreset.value
  const n = customAmount.value
  return Number.isFinite(n) && n != null ? n : 0
})

const withdrawableBalance = computed(() => Number(data.value?.withdrawableBalance || 0))
const withdrawMin = computed(() => data.value?.bankWithdrawKind === 'athlete' ? Number(data.value?.athleteWithdrawMin || 0) : 0)
const withdrawBelowMin = computed(() => withdrawMin.value > 0 && withdrawableBalance.value < withdrawMin.value)
const pendingClassBalance = computed(() => Number(data.value?.pendingClassBalance || 0))
const onlineBalance = computed(() => Number(data.value?.online?.availableBalance ?? data.value?.balance ?? 0))
const cashDesk = computed(() => data.value?.cashDesk || null)
const athTab = ref<'ledger' | 'cash'>('ledger')
const athPanel = ref<'topup' | 'withdraw' | null>(null)
const pendingPayout = computed(() => (data.value?.pendingWithdraws || []).reduce((sum, row) => sum + Number(row.amount || 0), 0))
function openAthPanel(panel: 'topup' | 'withdraw') {
  athPanel.value = panel
  athTab.value = 'ledger'
  nextTick(() => {
    document.getElementById(panel === 'topup' ? 'ath-topup' : 'ath-withdraw')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

function cashDeskRowLabel(row: NonNullable<AthleteCashDesk['recent']>[number]) {
  if (row.status === 'REFUNDED' && row.deskCashReturn === 'owed') return t('athlete.paymentStatusRefundedCashOwed')
  if (row.status === 'REFUNDED' && row.deskCashReturn === 'returned') return t('athlete.paymentStatusRefundedCashReturned')
  if (row.status === 'PAID') return t('athlete.paymentMethodCash')
  return row.status
}

const canTopUp = computed(() => {
  const amount = topUpAmount.value
  return amount >= WALLET_TOPUP_MIN_IRR && amount <= WALLET_TOPUP_MAX_IRR
})

function selectPreset(amount: number) {
  selectedPreset.value = amount
  customAmount.value = null
}

watch(customAmount, () => {
  selectedPreset.value = null
})

function txLabel(tx: { type?: string; amount: number; refundChannelKey?: string | null }) {
  if (tx.type === 'REFUND_CREDIT') {
    if (tx.refundChannelKey) return t(tx.refundChannelKey)
    return t('athlete.walletTypeRefund')
  }
  if (tx.type === 'PAYMENT_DEBIT') return t('athlete.walletTypePayment')
  if (tx.type === 'IPG_BOOKING_CREDIT') return t('athlete.walletTypeIpgInflow')
  if (tx.type === 'IPG_BOOKING_DEBIT') return t('athlete.walletTypeIpgBooking')
  if (tx.type === 'IPG_RETURNED_TO_CARD') return t('athlete.walletTypeIpgCardReturn')
  if (tx.type === 'TOPUP_CREDIT') return t('athlete.walletTypeTopUp')
  if (tx.type === 'WITHDRAW_HOLD') return t('athlete.walletTypeWithdrawHold')
  if (tx.type === 'WITHDRAW_RELEASE') return t('athlete.walletTypeWithdrawRelease')
  if (tx.type === 'WITHDRAW_PAID') return t('athlete.walletTypeWithdrawPaid')
  if (tx.type === 'ADJUSTMENT') return t('athlete.walletTypeAdjustment')
  return tx.amount > 0 ? t('athlete.walletCredit') : t('athlete.walletDebit')
}

async function startTopUp() {
  if (toppingUp.value) return
  flash.value = ''
  if (!onlineEnabled.value) {
    flashTone.value = 'error'
    flash.value = t('athlete.walletTopUpRequiresOnline')
    return
  }
  const amountToCharge = topUpAmount.value
  if (amountToCharge < WALLET_TOPUP_MIN_IRR || amountToCharge > WALLET_TOPUP_MAX_IRR) {
    flashTone.value = 'error'
    flash.value = t('athlete.walletTopUpInvalidAmount', {
      min: formatCurrency(WALLET_TOPUP_MIN_IRR),
      max: formatCurrency(WALLET_TOPUP_MAX_IRR),
    })
    return
  }
  toppingUp.value = true
  try {
    const session = await $fetch<{ intent: { redirectUrl?: string } }>('/api/wallet/topup', {
      method: 'POST',
      body: { amount: amountToCharge },
    })
    if (session.intent.redirectUrl) {
      await redirectToPaymentGateway(session.intent.redirectUrl)
      return
    }
    flashTone.value = 'error'
    flash.value = t('athlete.walletTopUpFailed')
  } catch (err: unknown) {
    flashTone.value = 'error'
    flash.value = fetchErrorMessage(err, t('athlete.walletTopUpFailed'))
  } finally {
    toppingUp.value = false
  }
}

async function saveSheba() {
  flash.value = ''
  payoutBusy.value = true
  try {
    const raw = shebaInput.value.trim()
    if (raw && !isValidSheba(raw)) {
      flashTone.value = 'error'
      flash.value = t('athlete.shebaInvalid')
      return
    }
    await $fetch('/api/wallet/sheba', {
      method: 'PATCH',
      body: { sheba: raw || null },
    })
    flashTone.value = 'success'
    flash.value = t('athlete.shebaSubmittedForApproval')
    await refresh()
  } catch (err: unknown) {
    flashTone.value = 'error'
    flash.value = fetchErrorMessage(err, t('athlete.shebaInvalid'))
  } finally {
    payoutBusy.value = false
  }
}

async function requestWithdraw() {
  flash.value = ''
  if (!data.value?.sheba) {
    flashTone.value = 'error'
    flash.value = t('athlete.withdrawNeedSheba')
    return
  }
  const amount = withdrawAmount.value
  if (!Number.isFinite(amount) || amount == null || amount <= 0) {
    flashTone.value = 'error'
    flash.value = t('athlete.withdrawInvalidAmount')
    return
  }
  if (amount < withdrawMin.value) {
    flashTone.value = 'error'
    flash.value = t('athlete.withdrawBelowMin', { min: formatCurrency(withdrawMin.value) })
    return
  }
  if (amount > withdrawableBalance.value) {
    flashTone.value = 'error'
    flash.value = t('athlete.withdrawInsufficient')
    return
  }
  payoutBusy.value = true
  try {
    await $fetch('/api/wallet/withdraw', {
      method: 'POST',
      body: { amount, idempotencyKey: crypto.randomUUID() },
    })
    flashTone.value = 'success'
    flash.value = t('athlete.withdrawSuccess')
    withdrawAmount.value = null
    await refresh()
  } catch (err: unknown) {
    flashTone.value = 'error'
    flash.value = fetchErrorMessage(err, t('athlete.withdrawFailed'))
  } finally {
    payoutBusy.value = false
  }
}

watch(
  () => route.query.payment,
  async (value) => {
    if (value === 'success') {
      flashTone.value = 'success'
      flash.value = t('athlete.walletTopUpSuccess')
      await refresh()
    } else if (value === 'cancelled') {
      flashTone.value = 'error'
      flash.value = t('athlete.walletTopUpCancelled')
    } else if (value === 'error') {
      flashTone.value = 'error'
      flash.value = t('athlete.walletTopUpFailed')
    } else {
      return
    }
    const query = { ...route.query }
    delete query.payment
    router.replace({ path: route.path, query })
  },
  { immediate: true },
)
</script>

<template>
  <div class="venus-page-stack ath-wallet-sot fin-v4">
    <CanvaSubpageHeader to="/athlete" :title="t('athlete.walletTitle')" :subtitle="t('athlete.walletSubtitle')" />
    <section class="fin-card fin-dark fin-ath" :aria-labelledby="'ath-online-balance'">
      <div id="ath-online-balance" class="fin-lab">{{ t('athlete.walletOnlineBalance') }}</div>
      <div class="fin-big tabular-nums">
        {{ formatNumber(onlineBalance) }}
        <small>{{ t('common.currency') }}</small>
      </div>
      <div class="fin-pair">
        <div>
          <div class="fin-lab">{{ t('athlete.walletBankTransferable') }}</div>
          <div class="v tabular-nums">{{ formatCurrency(data?.canBankWithdraw ? withdrawableBalance : 0) }}</div>
          <p class="fin-note">{{ data?.canBankWithdraw ? t('athlete.walletBankTransferableHint') : t('athlete.walletClosedLoopHint') }}</p>
          <p v-if="data?.canBankWithdraw && withdrawBelowMin" class="fin-note">
            {{ t('athlete.withdrawBelowMin', { min: formatCurrency(withdrawMin) }) }}
          </p>
        </div>
        <div>
          <div class="fin-lab">{{ t('athlete.walletInPayout') }}</div>
          <div class="v tabular-nums">{{ formatCurrency(pendingPayout) }}</div>
          <p v-if="pendingClassBalance > 0" class="fin-note">
            {{ t('athlete.pendingClassBalance', { amount: formatCurrency(pendingClassBalance) }) }}
          </p>
        </div>
      </div>
      <div class="fin-btns">
        <button type="button" class="fin-btn sec" @click="openAthPanel('topup')">{{ t('athlete.walletTopUpTitle') }}</button>
        <button type="button" class="fin-btn sec" @click="openAthPanel('withdraw')">{{ t('athlete.withdrawRequest') }}</button>
      </div>
      <p class="fin-note">{{ t('athlete.walletOnlineHint') }}</p>
    </section>
    <div class="fin-tabs" role="tablist" :aria-label="t('athlete.walletTitle')">
      <button type="button" role="tab" :aria-selected="athTab === 'ledger'" @click="athTab = 'ledger'">{{ t('athlete.walletLedgerTab') }}</button>
      <NuxtLink class="fin-tab-link" :to="localePath('/athlete/payments')">{{ t('athlete.walletPaymentsTab') }}</NuxtLink>
      <button type="button" role="tab" :aria-selected="athTab === 'cash'" @click="athTab = 'cash'">{{ t('athlete.walletCashBookTitle') }}</button>
    </div>

    <p
      v-if="flash"
      class="text-start text-sm font-bold"
      :class="flashTone === 'success' ? 'canva-flash-success' : 'canva-flash-error'"
    >
      {{ flash }}
    </p>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
      <section v-if="athTab === 'cash'" class="fin-card fin-stack">
        <h2 class="text-sm font-bold text-brand-navy">{{ t('athlete.walletCashBookTitle') }}</h2>
        <p class="text-xs text-brand-gray-600">{{ t('athlete.walletCashBookHint') }}</p>
        <dl class="space-y-1 text-sm">
          <div class="flex justify-between gap-3">
            <dt>{{ t('athlete.walletCashInClub') }}</dt>
            <dd class="tabular-nums font-bold text-brand-navy">{{ formatCurrency(cashDesk?.inTill || 0) }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt>{{ t('athlete.walletCashReturnsOwed') }}</dt>
            <dd
              class="tabular-nums font-bold"
              :class="(cashDesk?.returnsOwed || 0) > 0 ? 'text-red-600' : 'text-brand-navy'"
            >
              {{ formatCurrency(cashDesk?.returnsOwed || 0) }}
            </dd>
          </div>
          <div v-if="(cashDesk?.returnsReturned || 0) > 0" class="flex justify-between gap-3">
            <dt>{{ t('athlete.walletCashReturnsReturned') }}</dt>
            <dd class="tabular-nums font-bold text-brand-navy">{{ formatCurrency(cashDesk?.returnsReturned || 0) }}</dd>
          </div>
        </dl>
        <div v-if="cashDesk?.recent?.length" class="space-y-2">
          <div
            v-for="row in cashDesk.recent"
            :key="row.id"
            class="canva-list-card text-sm text-start"
          >
            <div class="flex justify-between gap-2">
              <p class="font-bold text-brand-navy">{{ row.clubName || row.title || '—' }}</p>
              <p class="tabular-nums font-bold">{{ formatCurrency(row.amount) }}</p>
            </div>
            <p class="mt-1 text-xs text-brand-gray-600">
              {{ cashDeskRowLabel(row) }}
              <template v-if="row.date"> · {{ formatDate(row.date) }}</template>
              <template v-if="row.startTime"> · <bdi dir="ltr">{{ formatTimeLabel(row.startTime) }}</bdi></template>
            </p>
          </div>
        </div>
        <p v-else class="text-sm text-brand-gray-500">{{ t('athlete.walletCashEmpty') }}</p>
      </section>

      <section v-show="athPanel === 'topup'" id="ath-topup" class="fin-card fin-stack">
        <h2 class="text-sm font-bold text-brand-navy">{{ t('athlete.walletTopUpTitle') }} · {{ t('athlete.walletOnlineBalance') }}</h2>
        <p v-if="!onlineEnabled" class="text-sm text-brand-gray-600">
          {{ t('athlete.walletTopUpRequiresOnline') }}
        </p>
        <template v-else>
          <p class="text-xs text-brand-gray-600">
            {{ isTestPayments ? t('athlete.walletTopUpTestHint') : t('athlete.walletTopUpHint') }}
          </p>
          <div class="canva-sot-chips grid grid-cols-2 gap-2">
            <button
              v-for="amount in presets"
              :key="amount"
              type="button"
              class="canva-chip border px-3 py-2 text-sm font-bold"
              :class="selectedPreset === amount
                ? 'border-brand-primary bg-brand-primary text-white'
                : 'border-brand-gray-300 bg-white text-brand-navy'"
              @click="selectPreset(amount)"
            >
              {{ formatCurrency(amount) }}
            </button>
          </div>
          <AppFormField field-id="wallet-custom-amount" :label="t('athlete.walletTopUpCustom')" numeric>
            <AppNumericInput
              id="wallet-custom-amount"
              v-model="customAmount"
              :placeholder="String(WALLET_TOPUP_MIN_IRR)"
            />
          </AppFormField>
          <button
            type="button"
            class="canva-gate-btn-primary w-full"
            :class="{ 'canva-cta-busy': toppingUp }"
            :disabled="!canTopUp || toppingUp"
            :aria-busy="toppingUp"
            @click="startTopUp"
          >
            {{
              toppingUp
                ? t('booking.redirectingToGateway')
                : canTopUp
                  ? t('athlete.walletTopUpCtaWithAmount', { amount: formatCurrency(topUpAmount) })
                  : t('athlete.walletTopUpSelectAmount')
            }}
          </button>
        </template>
      </section>

      <p v-if="athPanel === 'withdraw' && !data?.canBankWithdraw" id="ath-withdraw" class="fin-alert fin-alert-gry">{{ t('athlete.walletClosedLoopHint') }}</p>
      <section v-if="data?.canBankWithdraw && athPanel === 'withdraw'" id="ath-withdraw" class="fin-card fin-stack">
        <h2 class="text-sm font-bold text-brand-navy">{{ t('athlete.withdrawTitle') }}</h2>
        <p class="text-xs text-brand-gray-600">
          {{
            data?.dualWithdrawRails
              ? t('athlete.withdrawHintDualRails')
              : data?.bankWithdrawKind === 'coach'
                ? t('athlete.withdrawHintCoach')
                : t('athlete.withdrawHint')
          }}
        </p>
        <p v-if="shebaStatusMessage" class="text-xs text-brand-gray-600">{{ shebaStatusMessage }}</p>
        <AppFormField field-id="wallet-sheba" :label="t('athlete.shebaLabel')">
          <AppShebaInput
            id="wallet-sheba"
            v-model="shebaInput"
            :placeholder="t('athlete.shebaPlaceholder')"
          />
        </AppFormField>
        <button
          type="button"
          class="canva-gate-btn-secondary w-full"
          :disabled="payoutBusy"
          @click="saveSheba"
        >
          {{ t('athlete.shebaSave') }}
        </button>
        <AppFormField
          field-id="wallet-withdraw-amount"
          :label="t('athlete.withdrawAmount')"
          numeric
          :hint="!data?.sheba ? t('athlete.shebaRequired') : undefined"
        >
          <AppNumericInput
            id="wallet-withdraw-amount"
            v-model="withdrawAmount"
            :placeholder="t('athlete.withdrawAmountPlaceholder')"
          />
        </AppFormField>
        <button
          type="button"
          class="canva-gate-btn-primary w-full"
          :disabled="payoutBusy || withdrawBelowMin || !withdrawAmount || Number(withdrawAmount) < withdrawMin || Number(withdrawAmount) > withdrawableBalance"
          @click="requestWithdraw"
        >
          {{ t('athlete.withdrawRequest') }}
        </button>
        <p class="text-xs text-brand-gray-600">
          <NuxtLink :to="localePath('/cancellation')" class="underline">
            {{ t('athlete.withdrawCancelPolicyLink') }}
          </NuxtLink>
        </p>
        <div v-if="data?.pendingWithdraws?.length" class="space-y-2">
          <p class="text-sm font-bold text-brand-navy">{{ t('athlete.withdrawPending') }}</p>
          <div
            v-for="req in data.pendingWithdraws"
            :key="req.id"
            class="flex items-center justify-between gap-2 border border-brand-gray-200 bg-white px-3 py-2 text-sm"
          >
            <span class="tabular-nums font-bold" dir="ltr">{{ formatCurrency(req.amount) }}</span>
            <span class="text-brand-gray-600">{{ t('athlete.withdrawPending') }}</span>
          </div>
        </div>
      </section>

      <div v-if="athTab === 'ledger'" class="fin-card fin-stack">
        <!-- HTML .rh3 -->
        <h2 class="ath-wallet-history-title text-[15px] font-bold text-brand-primary text-start">{{ t('athlete.walletHistoryTitle') }} · {{ t('athlete.walletOnlineBalance') }}</h2>
        <div v-if="data?.transactions?.length" class="space-y-2">
          <div v-for="tx in data.transactions" :key="tx.id" class="canva-list-card text-sm text-start">
            <div class="flex items-center justify-between gap-2">
              <span class="font-bold text-brand-navy">{{ txLabel(tx) }}</span>
              <span class="font-bold" :class="tx.amount > 0 ? 'text-brand-primary' : 'text-brand-gray-600'">
                {{ formatCurrency(Math.abs(tx.amount)) }}
              </span>
            </div>
            <p class="mt-1 text-xs text-brand-gray-600" dir="auto">{{ formatDate(tx.createdAt) }}</p>
            <p v-if="tx.note" class="mt-1 text-xs text-brand-gray-600">{{ tx.note }}</p>
          </div>
        </div>
        <p v-else class="canva-panel text-sm text-brand-gray-600 text-start">{{ t('athlete.walletEmpty') }}</p>
      </div>
    </AppAsyncState>
  </div>
</template>

<style scoped>
/* SoT athlete-wallet (desktop): roomier red hero, compact preset chips, auto-width CTA + narrow input */
@media (min-width: 768px) {
  .ath-wallet-sot .ath-wallet-hero { padding: 28px 28px 30px; }
  .ath-wallet-sot .ath-wallet-amount { font-size: 34px; line-height: 1.3; margin-top: 18px; margin-bottom: 10px; }
  .ath-wallet-sot :deep(.canva-sot-chips) { display: flex; flex-wrap: wrap; gap: 8px; }
  .ath-wallet-sot :deep(.canva-sot-chips .canva-chip) { font-size: 11px; font-weight: 500; padding: 7px 14px; min-width: 52px; }
  .ath-wallet-sot :deep(.canva-sot-chips .canva-chip:not(.bg-brand-primary)) { color: #8f8f8b; border-color: rgba(44, 44, 42, 0.12); }
  .ath-wallet-sot .ath-wallet-history-title { margin-top: 12px; margin-bottom: 4px; }
  .ath-wallet-sot :deep(#wallet-custom-amount) { max-width: 242px; }
  .ath-wallet-sot :deep(.canva-sot-form .canva-gate-btn-primary) { width: auto; padding-inline: 26px; display: block; align-self: flex-start; margin-right: 0 !important; margin-left: auto !important; }
}
</style>
