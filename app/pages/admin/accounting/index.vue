<script setup lang="ts">
import type { AccountingPaymentBucket } from '#shared/bookingPayment.ts'

definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { secret, clearSecret, adminFetch } = useAdminSecret()
const { formatCurrency, formatNumber } = useFormatters()

type AccountingPayload = {
  range: { from: string | null; to: string | null }
  payments: {
    paidAmount: number
    paidCount: number
    paidIpgAmount: number
    paidIpgCount: number
    paidOnSiteAmount: number
    paidOnSiteCount: number
    paidWalletAmount: number
    paidWalletCount: number
    paidOtherAmount: number
    paidOtherCount: number
  }
  withdrawals: {
    pendingAmount: number
    pendingCount: number
    clubPendingAmount: number
    athletePendingAmount: number
  }
  clubBreakdown: Array<{ clubId: string; slug: string; nameFa: string; amount: number; count: number }>
  notes: { wallet: string; clubBreakdown: string }
}

const data = ref<AccountingPayload | null>(null)
const pending = ref(false)
const loadError = ref('')
const fromDate = ref('')
const toDate = ref('')

function paymentsDrillPath(bucket: AccountingPaymentBucket) {
  const params = new URLSearchParams({ bucket })
  if (fromDate.value) params.set('from', fromDate.value)
  if (toDate.value) params.set('to', toDate.value)
  return localePath(`/admin/accounting/payments?${params}`)
}

async function load() {
  if (!secret.value) return
  pending.value = true
  loadError.value = ''
  try {
    const params = new URLSearchParams()
    if (fromDate.value) params.set('from', fromDate.value)
    if (toDate.value) params.set('to', toDate.value)
    const qs = params.toString()
    data.value = await adminFetch<AccountingPayload>(`/api/admin/accounting${qs ? `?${qs}` : ''}`)
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 403) {
      loadError.value = t('admin.invalidSecret')
      clearSecret()
    } else {
      loadError.value = t('common.error')
    }
  } finally {
    pending.value = false
  }
}

watch(secret, (value) => {
  if (value) load()
}, { immediate: true })
</script>

<template>
  <div class="tail-page-stack">
    <section class="admin-overview-hero">
      <h1 class="text-2xl font-bold text-white">{{ t('admin.accounting.title') }}</h1>
      <p class="mt-1 text-sm text-white/85">{{ t('admin.accounting.subtitle') }}</p>
    </section>

    <form class="flex flex-wrap items-end gap-3" @submit.prevent="load">
      <AppFormField field-id="acct-from" :label="t('admin.accounting.fromDate')">
        <input id="acct-from" v-model="fromDate" type="date" class="neo-input" style="border-radius: 0;" dir="ltr">
      </AppFormField>
      <AppFormField field-id="acct-to" :label="t('admin.accounting.toDate')">
        <input id="acct-to" v-model="toDate" type="date" class="neo-input" style="border-radius: 0;" dir="ltr">
      </AppFormField>
      <button
        type="submit"
        class="bg-brand-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        style="border-radius: 0;"
        :disabled="pending"
      >
        {{ pending ? t('common.loading') : t('admin.accounting.applyRange') }}
      </button>
    </form>

    <AppAsyncState :pending="pending" :error="loadError ? new Error(loadError) : null" skeleton-variant="stat-grid">
      <div v-if="data" class="space-y-6">
        <div class="admin-acard">
          <h3>{{ t('admin.accounting.paidTotal') }}</h3>
          <p class="mb-3 text-xs text-brand-gray-500">{{ t('admin.accounting.paidTotalHint') }}</p>
          <b dir="ltr" class="block text-[26px] font-bold tabular-nums text-brand-navy">{{ formatCurrency(data.payments.paidAmount) }}</b>
          <span class="text-xs text-brand-gray-500">{{ t('admin.accounting.countLabel', { count: formatNumber(data.payments.paidCount) }) }}</span>
        </div>

        <section class="space-y-3">
          <h2 class="text-sm font-bold text-brand-navy">{{ t('admin.accounting.sectionBankInflow') }}</h2>
          <NuxtLink
            :to="paymentsDrillPath('IPG')"
            class="admin-accounting-bucket admin-accounting-bucket--inflow block transition hover:border-emerald-600"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-sm font-bold text-brand-navy">{{ t('admin.accounting.confirmedIpgTitle') }}</p>
                <p class="mt-1 text-xs text-emerald-800">{{ t('admin.accounting.confirmedIpgHint') }}</p>
              </div>
              <span class="text-xs font-bold text-brand-primary">{{ t('admin.accounting.viewTransactions') }}</span>
            </div>
            <b dir="ltr" class="mt-3 block text-[26px] font-bold tabular-nums text-brand-navy">{{ formatCurrency(data.payments.paidIpgAmount) }}</b>
            <span class="text-xs text-brand-gray-500">{{ t('admin.accounting.countLabel', { count: formatNumber(data.payments.paidIpgCount) }) }}</span>
          </NuxtLink>
        </section>

        <section class="space-y-3">
          <h2 class="text-sm font-bold text-brand-navy">{{ t('admin.accounting.sectionOnSite') }}</h2>
          <NuxtLink
            :to="paymentsDrillPath('ON_SITE')"
            class="admin-accounting-bucket block transition hover:border-brand-primary/50"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-sm font-bold text-brand-navy">{{ t('admin.accounting.bucket.ON_SITE') }}</p>
                <p class="mt-1 text-xs text-brand-gray-500">{{ t('admin.accounting.onSiteHint') }}</p>
              </div>
              <span class="text-xs font-bold text-brand-primary">{{ t('admin.accounting.viewTransactions') }}</span>
            </div>
            <b dir="ltr" class="mt-3 block text-[26px] font-bold tabular-nums text-brand-navy">{{ formatCurrency(data.payments.paidOnSiteAmount) }}</b>
            <span class="text-xs text-brand-gray-500">{{ t('admin.accounting.countLabel', { count: formatNumber(data.payments.paidOnSiteCount) }) }}</span>
          </NuxtLink>
        </section>

        <section class="space-y-3">
          <h2 class="text-sm font-bold text-brand-navy">{{ t('admin.accounting.sectionWallet') }}</h2>
          <NuxtLink
            :to="paymentsDrillPath('WALLET')"
            class="admin-accounting-bucket admin-accounting-bucket--wallet block transition hover:border-amber-600/60"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-sm font-bold text-brand-navy">{{ t('admin.accounting.bucket.WALLET') }}</p>
                <p class="mt-1 text-xs text-amber-900">{{ t('admin.accounting.walletNote') }}</p>
              </div>
              <span class="text-xs font-bold text-brand-primary">{{ t('admin.accounting.viewTransactions') }}</span>
            </div>
            <b dir="ltr" class="mt-3 block text-[26px] font-bold tabular-nums text-brand-navy">{{ formatCurrency(data.payments.paidWalletAmount) }}</b>
            <span class="text-xs text-brand-gray-500">{{ t('admin.accounting.countLabel', { count: formatNumber(data.payments.paidWalletCount) }) }}</span>
          </NuxtLink>
        </section>

        <section v-if="data.payments.paidOtherCount > 0" class="space-y-3">
          <h2 class="text-sm font-bold text-brand-navy">{{ t('admin.accounting.sectionOther') }}</h2>
          <NuxtLink
            :to="paymentsDrillPath('OTHER')"
            class="admin-accounting-bucket block transition hover:border-brand-primary/50"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <p class="text-sm font-bold text-brand-navy">{{ t('admin.accounting.otherPaid') }}</p>
              <span class="text-xs font-bold text-brand-primary">{{ t('admin.accounting.viewTransactions') }}</span>
            </div>
            <b dir="ltr" class="mt-3 block text-[26px] font-bold tabular-nums text-brand-navy">{{ formatCurrency(data.payments.paidOtherAmount) }}</b>
            <span class="text-xs text-brand-gray-500">{{ t('admin.accounting.countLabel', { count: formatNumber(data.payments.paidOtherCount) }) }}</span>
          </NuxtLink>
        </section>

        <section class="space-y-3">
          <h2 class="text-sm font-bold text-brand-gray-600">{{ t('admin.accounting.sectionNotRevenue') }}</h2>
          <div class="admin-acard border-amber-200 bg-amber-50/40">
            <h3>{{ t('admin.accounting.pendingWithdrawals') }}</h3>
            <p class="mb-3 text-xs text-brand-gray-600">{{ t('admin.accounting.withdrawalsHint') }}</p>
            <div class="admin-akv">
              <span>{{ t('admin.metrics.pendingWithdrawals') }}</span>
              <b dir="ltr">{{ formatCurrency(data.withdrawals.pendingAmount) }}</b>
            </div>
            <div class="admin-akv">
              <span>{{ t('admin.accounting.clubPending') }}</span>
              <b dir="ltr">{{ formatCurrency(data.withdrawals.clubPendingAmount) }}</b>
            </div>
            <div class="admin-akv">
              <span>{{ t('admin.accounting.athletePending') }}</span>
              <b dir="ltr">{{ formatCurrency(data.withdrawals.athletePendingAmount) }}</b>
            </div>
            <NuxtLink :to="localePath('/admin/withdrawals')" class="admin-alink">{{ t('admin.nav.withdrawals') }}</NuxtLink>
          </div>
        </section>

        <div v-if="data.clubBreakdown.length" class="overflow-x-auto border border-brand-gray-200 bg-white" style="border-radius: 0;">
          <h3 class="border-b border-brand-gray-200 bg-brand-gray-50 p-3 text-sm font-bold">{{ t('admin.accounting.clubBreakdown') }}</h3>
          <p class="px-3 py-2 text-xs text-brand-gray-500">{{ t('admin.accounting.clubBreakdownHint') }}</p>
          <table class="w-full min-w-[480px] text-start text-sm">
            <thead class="border-b border-brand-gray-200 text-xs">
              <tr>
                <th class="p-3 font-bold">{{ t('admin.accounting.colClub') }}</th>
                <th class="p-3 font-bold">{{ t('admin.accounting.colPaidBookings') }}</th>
                <th class="p-3 font-bold">{{ t('admin.accounting.amount') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in data.clubBreakdown" :key="row.clubId" class="border-b border-brand-gray-100">
                <td class="p-3">
                  <NuxtLink :to="localePath(`/admin/clubs/${row.clubId}`)" class="admin-alink">{{ row.nameFa }}</NuxtLink>
                </td>
                <td class="p-3 tabular-nums" dir="ltr">{{ formatNumber(row.count) }}</td>
                <td class="p-3 tabular-nums" dir="ltr">{{ formatCurrency(row.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </AppAsyncState>
  </div>
</template>

<style scoped>
.admin-overview-hero {
  @apply relative mb-6 overflow-hidden p-[22px] text-white min-[431px]:px-7;
  border-radius: 0;
  background: linear-gradient(135deg, #c41e1e, #b01818);
}

.admin-accounting-bucket {
  @apply border border-brand-gray-200 bg-white p-5 text-start no-underline;
  border-radius: 0;
}

.admin-accounting-bucket--inflow {
  @apply border-emerald-300 bg-emerald-50/30;
}

.admin-accounting-bucket--wallet {
  @apply border-amber-200 bg-amber-50/25;
}
</style>
