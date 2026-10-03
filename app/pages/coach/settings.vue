<script setup lang="ts">
import { isValidSheba } from '#shared/settlement.ts'
import { WALLET_TOPUP_MAX_IRR, WALLET_TOPUP_MIN_IRR } from '#shared/walletTopUp.ts'
import { fetchErrorMessage } from '~/composables/useFetchError'

definePageMeta({ layout: 'dashboard-coach', middleware: ['auth', 'role'], role: 'COACH', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()
const { logout } = useAuth()
const { formatCurrency } = useFormatters()
const { onlineEnabled, redirectToPaymentGateway } = useCheckout()

const { data, pending, error, refresh } = await useAuthedFetch<{
  balance?: number
  withdrawableBalance?: number
  sheba?: string | null
  pendingWithdraws?: Array<{ id: string; amount: number }>
}>('/api/wallet')

const topUpAmount = ref(WALLET_TOPUP_MIN_IRR)
const topUpBusy = ref(false)
const shebaInput = ref('')
const withdrawAmount = ref<number | null>(null)
const payoutBusy = ref(false)
const flash = ref('')
const flashTone = ref<'success' | 'error'>('success')

watch(data, (value) => {
  if (value?.sheba) shebaInput.value = value.sheba
}, { immediate: true })

const withdrawableBalance = computed(() => Number(data.value?.withdrawableBalance || 0))

function setFlash(tone: 'success' | 'error', message: string) {
  flashTone.value = tone
  flash.value = message
}

async function startTopUp() {
  if (topUpBusy.value) return
  flash.value = ''
  if (!onlineEnabled.value) {
    setFlash('error', t('athlete.walletTopUpRequiresOnline'))
    return
  }
  if (topUpAmount.value < WALLET_TOPUP_MIN_IRR || topUpAmount.value > WALLET_TOPUP_MAX_IRR) {
    setFlash('error', t('athlete.walletTopUpInvalidAmount', {
      min: formatCurrency(WALLET_TOPUP_MIN_IRR),
      max: formatCurrency(WALLET_TOPUP_MAX_IRR),
    }))
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
    setFlash('error', t('athlete.walletTopUpFailed'))
  }
  catch (err: unknown) {
    setFlash('error', fetchErrorMessage(err, t('athlete.walletTopUpFailed')))
  }
  finally {
    topUpBusy.value = false
  }
}

async function saveSheba() {
  flash.value = ''
  payoutBusy.value = true
  try {
    const raw = shebaInput.value.trim()
    if (raw && !isValidSheba(raw)) {
      setFlash('error', t('athlete.shebaInvalid'))
      return
    }
    await $fetch('/api/wallet/sheba', { method: 'PATCH', body: { sheba: raw || null } })
    setFlash('success', t('athlete.shebaSaved'))
    await refresh()
  }
  catch (err: unknown) {
    setFlash('error', fetchErrorMessage(err, t('athlete.shebaInvalid')))
  }
  finally {
    payoutBusy.value = false
  }
}

async function requestWithdraw() {
  flash.value = ''
  if (!data.value?.sheba) {
    setFlash('error', t('athlete.withdrawNeedSheba'))
    return
  }
  const amount = withdrawAmount.value
  if (!Number.isFinite(amount) || amount == null || amount <= 0) {
    setFlash('error', t('athlete.withdrawInvalidAmount'))
    return
  }
  if (amount > withdrawableBalance.value) {
    setFlash('error', t('athlete.withdrawInsufficient'))
    return
  }
  payoutBusy.value = true
  try {
    await $fetch('/api/wallet/withdraw', { method: 'POST', body: { amount } })
    setFlash('success', t('athlete.withdrawSuccess'))
    withdrawAmount.value = null
    await refresh()
  }
  catch (err: unknown) {
    setFlash('error', fetchErrorMessage(err, t('athlete.withdrawFailed')))
  }
  finally {
    payoutBusy.value = false
  }
}

async function signOut() {
  await logout()
}

watch(
  () => route.query.payment,
  async (value) => {
    if (value === 'success') {
      setFlash('success', t('athlete.walletTopUpSuccess'))
      await refresh()
    }
    else if (value === 'cancelled') setFlash('error', t('athlete.walletTopUpCancelled'))
    else if (value === 'error') setFlash('error', t('athlete.walletTopUpFailed'))
    else return
    const query = { ...route.query }
    delete query.payment
    router.replace({ path: route.path, query })
  },
  { immediate: true },
)
</script>

<template>
  <div class="venus-page-stack">
    <CanvaCoachPhotoHero />
    <div class="canva-cal-sheet -mx-4 min-[431px]:mx-0">
      <h1 class="mb-0 text-start text-base font-bold text-brand-navy min-[431px]:text-xl min-[431px]:leading-snug">
        {{ t('coach.settingsTitle') }}
      </h1>
      <div class="min-h-[2.75rem]">
        <RoleDashboardSwitcher current="COACH" />
      </div>

      <NuxtLink
        :to="localePath('/coach/profile')"
        class="canva-owner-secondary-cta flex items-center justify-center no-underline"
      >
        {{ t('coach.settingsProfile') }}
      </NuxtLink>

      <p
        v-if="flash"
        class="text-start text-sm font-bold"
        :class="flashTone === 'success' ? 'canva-flash-success' : 'canva-flash-error'"
      >
        {{ flash }}
      </p>

      <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
        <section class="canva-panel space-y-3 text-start">
          <div>
            <p class="text-xs font-bold text-brand-gray-600">{{ t('coach.book.walletBalance') }}</p>
            <p class="mt-0.5 text-base font-bold text-brand-navy tabular-nums" dir="auto">
              {{ formatCurrency(data?.balance || 0) }}
            </p>
            <p class="mt-1 text-xs text-brand-gray-600">
              {{ t('athlete.withdrawAvailable', { amount: formatCurrency(withdrawableBalance) }) }}
            </p>
          </div>
          <AppFormField :label="t('athlete.walletTopUpTitle')" numeric>
            <AppNumericInput v-model="topUpAmount" :min="WALLET_TOPUP_MIN_IRR" :max="WALLET_TOPUP_MAX_IRR" />
          </AppFormField>
          <button
            type="button"
            class="canva-gate-btn-primary"
            :class="{ 'canva-cta-busy': topUpBusy }"
            :disabled="topUpBusy"
            :aria-busy="topUpBusy"
            @click="startTopUp"
          >
            {{ topUpBusy ? t('common.loading') : t('coach.book.topUpConfirm') }}
          </button>
        </section>

        <section class="canva-panel space-y-3 text-start">
          <h2 class="text-sm font-bold text-brand-navy">{{ t('athlete.withdrawTitle') }}</h2>
          <AppFormField :label="t('athlete.shebaLabel')">
            <AppShebaInput
              v-model="shebaInput"
              :placeholder="t('athlete.shebaPlaceholder')"
            />
          </AppFormField>
          <button type="button" class="canva-gate-btn-secondary" :disabled="payoutBusy" @click="saveSheba">
            {{ t('athlete.shebaSave') }}
          </button>
          <AppFormField :label="t('athlete.withdrawAmount')" numeric>
            <AppNumericInput
              v-model="withdrawAmount"
              :disabled="!data?.sheba || withdrawableBalance <= 0"
            />
          </AppFormField>
          <button
            type="button"
            class="canva-gate-btn-primary"
            :disabled="payoutBusy || !data?.sheba || !withdrawAmount || withdrawableBalance <= 0"
            @click="requestWithdraw"
          >
            {{ t('athlete.withdrawRequest') }}
          </button>
          <div v-if="data?.pendingWithdraws?.length" class="space-y-2">
            <p class="text-sm font-bold text-brand-navy">{{ t('athlete.withdrawPending') }}</p>
            <p
              v-for="req in data.pendingWithdraws"
              :key="req.id"
              class="text-sm font-bold tabular-nums"
              dir="ltr"
            >
              {{ formatCurrency(req.amount) }}
            </p>
          </div>
        </section>
      </AppAsyncState>

      <button type="button" class="canva-gate-btn-secondary" @click="signOut">
        {{ t('coach.settingsLogout') }}
      </button>
    </div>
  </div>
</template>
