<script setup lang="ts">
import { WALLET_TOPUP_PRESETS_IRR, WALLET_TOPUP_MIN_IRR, WALLET_TOPUP_MAX_IRR } from '#shared/walletTopUp.ts'
import { isValidSheba } from '#shared/settlement.ts'

definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const { formatCurrency, formatDate } = useFormatters()
const { onlineEnabled, isTestPayments, redirectToPaymentGateway } = useCheckout()
const { fetchErrorMessage } = useFetchError()
const { data, pending, error, refresh } = await useAuthedFetch('/api/wallet')

const selectedPreset = ref<number | null>(WALLET_TOPUP_PRESETS_IRR[1] ?? 500_000)
const customAmount = ref('')
const toppingUp = ref(false)
const flash = ref('')
const flashTone = ref<'success' | 'error'>('success')

const shebaInput = ref('')
const withdrawAmount = ref('')
const payoutBusy = ref(false)

const presets = WALLET_TOPUP_PRESETS_IRR

watch(data, (value) => {
  if (value?.sheba) shebaInput.value = value.sheba
}, { immediate: true })

const topUpAmount = computed(() => {
  if (selectedPreset.value != null) return selectedPreset.value
  const digits = customAmount.value.replace(/[^\d]/g, '')
  const n = Number(digits)
  return Number.isFinite(n) ? n : 0
})

function selectPreset(amount: number) {
  selectedPreset.value = amount
  customAmount.value = ''
}

function onCustomInput() {
  selectedPreset.value = null
}

function txLabel(tx: { type?: string; amount: number }) {
  if (tx.type === 'REFUND_CREDIT') return t('athlete.walletTypeRefund')
  if (tx.type === 'PAYMENT_DEBIT') return t('athlete.walletTypePayment')
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
  const amount = topUpAmount.value
  if (amount < WALLET_TOPUP_MIN_IRR || amount > WALLET_TOPUP_MAX_IRR) {
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
      body: { amount },
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
    flash.value = t('athlete.shebaSaved')
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
  const amount = Number(String(withdrawAmount.value).replace(/[^\d]/g, ''))
  if (!Number.isFinite(amount) || amount <= 0) {
    flashTone.value = 'error'
    flash.value = t('athlete.withdrawInvalidAmount')
    return
  }
  if (amount > (data.value.balance || 0)) {
    flashTone.value = 'error'
    flash.value = t('athlete.withdrawInsufficient')
    return
  }
  payoutBusy.value = true
  try {
    await $fetch('/api/wallet/withdraw', {
      method: 'POST',
      body: { amount },
    })
    flashTone.value = 'success'
    flash.value = t('athlete.withdrawSuccess')
    withdrawAmount.value = ''
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
  <div class="venus-page-stack">
    <CanvaSubpageHeader to="/athlete" :title="t('athlete.walletTitle')" />
    <section class="canva-dash-hero">
      <p class="text-xs text-white/80 text-start">{{ t('athlete.walletTitle') }}</p>
      <p class="mt-2 text-3xl font-bold text-start">{{ formatCurrency(data?.balance || 0) }}</p>
      <p class="mt-1 text-sm text-white/85 text-start">{{ t('athlete.walletSubtitle') }}</p>
    </section>

    <p
      v-if="flash"
      class="text-start text-sm font-bold"
      :class="flashTone === 'success' ? 'canva-flash-success' : 'canva-flash-error'"
    >
      {{ flash }}
    </p>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
      <section class="canva-panel space-y-3 text-start">
        <h2 class="text-sm font-bold text-brand-navy">{{ t('athlete.walletTopUpTitle') }}</h2>
        <p v-if="!onlineEnabled" class="text-sm text-brand-gray-600">
          {{ t('athlete.walletTopUpRequiresOnline') }}
        </p>
        <template v-else>
          <p class="text-xs text-brand-gray-600">
            {{ isTestPayments ? t('athlete.walletTopUpTestHint') : t('athlete.walletTopUpHint') }}
          </p>
          <p class="text-xs font-bold text-red-600" role="note">
            {{ t('athlete.walletTopUpPayoutNotice') }}
          </p>
          <div class="grid grid-cols-2 gap-2">
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
            <input
              id="wallet-custom-amount"
              v-model="customAmount"
              dir="ltr"
              inputmode="numeric"
              class="neo-input bg-white/95 tabular-nums"
              :placeholder="String(WALLET_TOPUP_MIN_IRR)"
              @input="onCustomInput"
            />
          </AppFormField>
          <button
            type="button"
            class="canva-gate-btn-primary w-full"
            :class="{ 'canva-cta-busy': toppingUp }"
            :aria-busy="toppingUp"
            @click="startTopUp"
          >
            {{ toppingUp ? t('booking.redirectingToGateway') : t('athlete.walletTopUpCta') }}
          </button>
        </template>
      </section>

      <section class="canva-panel space-y-3 text-start">
        <h2 class="text-sm font-bold text-brand-navy">{{ t('athlete.withdrawTitle') }}</h2>
        <p class="text-xs text-brand-gray-600">{{ t('athlete.withdrawHint') }}</p>
        <AppFormField field-id="wallet-sheba" :label="t('athlete.shebaLabel')" numeric>
          <input
            id="wallet-sheba"
            v-model="shebaInput"
            dir="ltr"
            class="neo-input bg-white/95 font-mono text-sm"
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
        <p v-if="!data?.sheba" class="text-xs text-brand-primary">{{ t('athlete.shebaRequired') }}</p>
        <AppFormField field-id="wallet-withdraw-amount" :label="t('athlete.withdrawAmount')" numeric>
          <input
            id="wallet-withdraw-amount"
            v-model="withdrawAmount"
            dir="ltr"
            inputmode="numeric"
            class="neo-input bg-white/95 tabular-nums"
            :disabled="!data?.sheba"
            :placeholder="t('athlete.withdrawAmountPlaceholder')"
          />
        </AppFormField>
        <button
          type="button"
          class="canva-gate-btn-primary w-full"
          :disabled="payoutBusy || !data?.sheba || !withdrawAmount"
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

      <div class="space-y-2">
        <h2 class="text-sm font-bold text-brand-primary text-start">{{ t('athlete.walletHistoryTitle') }}</h2>
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
