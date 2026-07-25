<script setup lang="ts">
/** Canva «روش‌های پرداخت» — wallet + pay-at-club (hub-child pattern). */
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { formatCurrency, formatDate } = useFormatters()
const { data, pending, error } = await useAuthedFetch('/api/wallet')

function txLabel(tx: { type?: string; amount: number }) {
  if (tx.type === 'REFUND_CREDIT') return t('athlete.walletTypeRefund')
  if (tx.type === 'PAYMENT_DEBIT') return t('athlete.walletTypePayment')
  if (tx.type === 'ADJUSTMENT') return t('athlete.walletTypeAdjustment')
  return tx.amount > 0 ? t('athlete.walletCredit') : t('athlete.walletDebit')
}
</script>

<template>
  <div class="venus-page-stack">
    <section class="canva-dash-hero">
      <p class="text-xs text-white/80">{{ t('athlete.paymentMethods') }}</p>
      <h1 class="canva-page-hero-title mt-1">{{ t('athlete.paymentMethodsTitle') }}</h1>
      <p class="mt-1 text-sm text-white/85">{{ t('athlete.paymentMethodsSubtitle') }}</p>
    </section>

    <div class="canva-dash-menu !mt-0 space-y-0">
      <div class="canva-dash-menu-item pointer-events-none">
        <span class="canva-dash-menu-icon">
          <AppIcon name="storefront" size="sm" />
        </span>
        <div class="min-w-0 flex-1">
          <p>{{ t('athlete.payAtClubMethod') }}</p>
          <p class="mt-0.5 text-xs font-medium text-brand-gray-500">{{ t('athlete.payAtClubMethodBody') }}</p>
        </div>
      </div>
      <div class="canva-dash-menu-item pointer-events-none">
        <span class="canva-dash-menu-icon">
          <AppIcon name="account_balance_wallet" size="sm" />
        </span>
        <div class="min-w-0 flex-1">
          <p>{{ t('nav.wallet') }}</p>
          <p class="mt-0.5 text-xs font-medium text-brand-gray-500">{{ t('athlete.walletRefundsOnly') }}</p>
        </div>
        <p class="shrink-0 text-sm font-bold text-brand-primary">{{ formatCurrency(data?.balance || 0) }}</p>
      </div>
    </div>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
      <div class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-sm font-bold text-brand-primary">{{ t('athlete.walletHistoryTitle') }}</h2>
          <NuxtLink :to="localePath('/athlete/wallet')" class="text-xs font-bold text-brand-gray-600">
            {{ t('common.detail') }}
          </NuxtLink>
        </div>
        <div v-if="data?.transactions?.length" class="space-y-2">
          <div v-for="tx in data.transactions.slice(0, 5)" :key="tx.id" class="canva-list-card text-sm">
            <div class="flex items-center justify-between gap-2">
              <span class="font-bold text-brand-navy">{{ txLabel(tx) }}</span>
              <span class="font-bold" :class="tx.amount > 0 ? 'text-brand-primary' : 'text-brand-gray-600'">
                {{ formatCurrency(Math.abs(tx.amount)) }}
              </span>
            </div>
            <p class="mt-1 text-xs text-brand-gray-600" dir="auto">{{ formatDate(tx.createdAt) }}</p>
          </div>
        </div>
        <p v-else class="canva-panel text-sm text-brand-gray-600">{{ t('athlete.walletEmpty') }}</p>
      </div>
    </AppAsyncState>
  </div>
</template>
