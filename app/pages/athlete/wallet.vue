<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const { t } = useI18n()
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
      <p class="text-xs text-white/80">{{ t('athlete.walletTitle') }}</p>
      <p class="mt-2 text-3xl font-bold">{{ formatCurrency(data?.balance || 0) }}</p>
      <p class="mt-1 text-sm text-white/85">{{ t('athlete.walletRefundsOnly') }}</p>
    </section>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
      <div class="canva-panel space-y-2">
        <p class="text-sm text-brand-gray-600">{{ t('athlete.walletTopUpUnavailable') }}</p>
      </div>

      <div class="space-y-2">
        <h2 class="text-sm font-bold text-brand-primary">{{ t('athlete.walletHistoryTitle') }}</h2>
        <div v-if="data?.transactions?.length" class="space-y-2">
          <div v-for="tx in data.transactions" :key="tx.id" class="canva-list-card text-sm">
            <div class="flex items-center justify-between gap-2">
              <span class="font-bold text-brand-navy">{{ txLabel(tx) }}</span>
              <span class="font-bold" :class="tx.amount > 0 ? 'text-brand-primary' : 'text-brand-gray-600'">
                {{ formatCurrency(Math.abs(tx.amount)) }}
              </span>
            </div>
            <p class="mt-1 text-xs text-brand-gray-600" dir="auto">{{ formatDate(tx.createdAt) }}</p>
            <p v-if="tx.note" class="mt-1 text-brand-gray-600">{{ tx.note }}</p>
          </div>
        </div>
        <p v-else class="canva-panel text-sm text-brand-gray-600">{{ t('athlete.walletEmpty') }}</p>
      </div>
    </AppAsyncState>
  </div>
</template>
