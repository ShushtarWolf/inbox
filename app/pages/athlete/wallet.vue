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
    <PageHeaderNav :title="t('athlete.walletTitle')" :show-actions="false" />

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
      <div class="ios-card space-y-3 p-4">
        <p class="text-sm text-brand-gray-600">{{ t('booking.walletBalance') }}</p>
        <p class="text-2xl font-bold">{{ formatCurrency(data?.balance || 0) }}</p>
        <p class="text-xs font-bold text-brand-gray-600">{{ t('athlete.walletRefundsOnly') }}</p>
        <p class="text-sm text-brand-gray-600">{{ t('athlete.walletTopUpUnavailable') }}</p>
      </div>

      <div class="space-y-2">
        <h2 class="text-sm font-bold text-brand-gray-600">{{ t('athlete.walletHistoryTitle') }}</h2>
        <div v-if="data?.transactions?.length" class="space-y-2">
          <div v-for="tx in data.transactions" :key="tx.id" class="ios-card p-3 text-sm">
            <div class="flex items-center justify-between gap-2">
              <span class="font-bold">{{ txLabel(tx) }}</span>
              <span :class="tx.amount > 0 ? 'text-brand-primary' : 'text-brand-gray-600'">{{ formatCurrency(Math.abs(tx.amount)) }}</span>
            </div>
            <p class="mt-1 text-xs text-brand-gray-600" dir="auto">{{ formatDate(tx.createdAt) }}</p>
            <p v-if="tx.note" class="mt-1 text-brand-gray-600">{{ tx.note }}</p>
          </div>
        </div>
        <p v-else class="text-sm text-brand-gray-600">{{ t('athlete.walletEmpty') }}</p>
      </div>
    </AppAsyncState>
  </div>
</template>
