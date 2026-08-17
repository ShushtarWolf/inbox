<script setup lang="ts">
/** Canva athlete payments — real Payment rows + wallet snapshot. */
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { formatCurrency, formatDate, formatTimeLabel } = useFormatters()
const { localizedField } = useLocalizedField()
const { onlineEnabled, canPayOnline, startCheckout } = useCheckout()
const { fetchErrorMessage } = useFetchError()

const { data: wallet, pending: walletPending } = await useAuthedFetch('/api/wallet')
const { data, pending, error, refresh } = await useAuthedFetch('/api/athlete/payments')

const payingId = ref<string | null>(null)
const payError = ref('')

function statusLabel(status: string) {
  return t(`booking.paymentStatus.${status}`)
}

function methodLabel(method: string) {
  if (method === 'IPG') return t('athlete.paymentMethodIpg')
  if (method === 'CASH') return t('athlete.paymentMethodCash')
  if (method === 'PAID') return t('athlete.paymentMethodWallet')
  return t('athlete.paymentMethodUnpaid')
}

async function retryPay(row: { bookingId?: string | null; status: string }) {
  if (!row.bookingId || !canPayOnline(row.status) || payingId.value) return
  payingId.value = row.bookingId
  payError.value = ''
  try {
    await startCheckout({ bookingId: row.bookingId })
    await refresh()
  } catch (err: unknown) {
    payError.value = fetchErrorMessage(err, t('booking.gatewayRedirectStalled'))
  } finally {
    payingId.value = null
  }
}
</script>

<template>
  <div class="venus-page-stack">
    <CanvaSubpageHeader to="/athlete" :title="t('athlete.paymentMethodsTitle')" />
    <section class="canva-dash-hero">
      <p class="text-xs text-white/80">{{ t('athlete.paymentMethods') }}</p>
      <h1 class="canva-page-hero-title mt-1">{{ t('athlete.paymentMethodsTitle') }}</h1>
      <p class="mt-1 text-sm text-white/85 text-start">{{ t('athlete.paymentMethodsSubtitle') }}</p>
    </section>

    <div class="canva-dash-menu !mt-0 space-y-0">
      <div v-if="onlineEnabled" class="canva-dash-menu-item pointer-events-none">
        <span class="canva-dash-menu-icon">
          <AppIcon name="payments" size="sm" />
        </span>
        <div class="min-w-0 flex-1 text-start">
          <p>{{ t('athlete.payOnlineMethod') }}</p>
          <p class="mt-0.5 text-xs font-medium text-brand-gray-500">{{ t('athlete.payOnlineMethodBody') }}</p>
        </div>
      </div>
      <div class="canva-dash-menu-item pointer-events-none">
        <span class="canva-dash-menu-icon">
          <AppIcon name="storefront" size="sm" />
        </span>
        <div class="min-w-0 flex-1 text-start">
          <p>{{ t('athlete.payAtClubMethod') }}</p>
          <p class="mt-0.5 text-xs font-medium text-brand-gray-500">{{ t('athlete.payAtClubMethodBody') }}</p>
        </div>
      </div>
      <NuxtLink :to="localePath('/athlete/wallet')" class="canva-dash-menu-item">
        <span class="canva-dash-menu-icon">
          <AppIcon name="account_balance_wallet" size="sm" />
        </span>
        <div class="min-w-0 flex-1 text-start">
          <p>{{ t('nav.wallet') }}</p>
          <p class="mt-0.5 text-xs font-medium text-brand-gray-500">{{ t('athlete.walletSubtitle') }}</p>
        </div>
        <p class="shrink-0 text-sm font-bold text-brand-primary">
          {{ formatCurrency(walletPending ? 0 : (wallet?.balance || 0)) }}
        </p>
        <AppIcon name="chevron_left" size="sm" class="text-brand-gray-400" />
      </NuxtLink>
    </div>

    <p v-if="payError" class="canva-flash-error text-start text-sm">{{ payError }}</p>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
      <div class="space-y-2">
        <h2 class="text-sm font-bold text-brand-primary text-start">{{ t('athlete.paymentHistoryTitle') }}</h2>
        <div v-if="data?.payments?.length" class="space-y-2">
          <div
            v-for="row in data.payments"
            :key="row.id"
            class="canva-list-card text-sm text-start"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <p class="font-bold text-brand-navy">
                  {{ row.kind === 'topup' ? t('athlete.walletTypeTopUp') : (row.title || t('home.bookCourt')) }}
                  <span v-if="row.club" class="font-medium text-brand-gray-600">
                    · {{ localizedField(row.club, 'nameFa', 'nameEn') }}
                  </span>
                </p>
                <p class="mt-1 text-xs text-brand-gray-600">
                  {{ statusLabel(row.status) }} · {{ methodLabel(row.method) }}
                </p>
                <p v-if="row.date" class="mt-1 text-xs text-brand-gray-500">
                  {{ formatDate(row.date) }}
                  <template v-if="row.startTime"> · <bdi dir="ltr" class="tabular-nums">{{ formatTimeLabel(row.startTime) }}</bdi></template>
                </p>
                <p class="mt-1 text-xs text-brand-gray-500">{{ formatDate(row.createdAt) }}</p>
              </div>
              <span class="shrink-0 font-bold text-brand-navy tabular-nums">{{ formatCurrency(row.amount) }}</span>
            </div>
            <button
              v-if="row.bookingId && canPayOnline(row.status)"
              type="button"
              class="canva-gate-btn-primary mt-3 w-full text-sm"
              :class="{ 'canva-cta-busy': payingId === row.bookingId }"
              :aria-busy="payingId === row.bookingId"
              @click="retryPay(row)"
            >
              {{ payingId === row.bookingId ? t('booking.redirectingToGateway') : t('booking.payNow') }}
            </button>
          </div>
        </div>
        <p v-else class="canva-panel text-sm text-brand-gray-600 text-start">{{ t('athlete.paymentHistoryEmpty') }}</p>
      </div>
    </AppAsyncState>
  </div>
</template>
