<script setup lang="ts">
/** Canva athlete payments — real Payment rows + wallet snapshot + filterable table. */
import {
  selectAthletePayments,
  type AthletePayMethodFilter,
  type AthletePaySortDir,
  type AthletePaySortKey,
  type AthletePayStatusFilter,
} from '#shared/athletePayments.ts'

definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { formatCurrency, formatDate, formatTimeLabel } = useFormatters()
const { localizedField } = useLocalizedField()
const { onlineEnabled, canPayOnline, startCheckout } = useCheckout()
const { fetchErrorMessage } = useFetchError()

type PaymentRow = {
  id: string
  kind: string
  title?: string | null
  club?: { nameFa?: string; nameEn?: string } | null
  status: string
  method: string
  date?: string | null
  startTime?: string | null
  createdAt: string
  amount: number
  bookingId?: string | null
}

const { data: wallet, pending: walletPending, refresh: refreshWallet } = await useAuthedFetch<{ balance?: number }>('/api/wallet')
const { data, pending, error, refresh } = await useAuthedFetch<{
  payments?: PaymentRow[]
}>('/api/athlete/payments?limit=100')

onMounted(() => {
  void refresh()
  void refreshWallet()
})

watch(
  () => route.query.payment,
  (value) => {
    if (value === 'success' || value === 'cancelled' || value === 'error') {
      void refresh()
      void refreshWallet()
    }
  },
)

const payingId = ref<string | null>(null)
const payError = ref('')

const statusFilter = ref<AthletePayStatusFilter>('all')
const methodFilter = ref<AthletePayMethodFilter>('all')
const dateFrom = ref('')
const dateTo = ref('')
const sortKey = ref<AthletePaySortKey>('date')
const sortDir = ref<AthletePaySortDir>('desc')

const statusChips: Array<{ value: AthletePayStatusFilter, labelKey: string }> = [
  { value: 'all', labelKey: 'athlete.paymentFilterAll' },
  { value: 'paid', labelKey: 'athlete.paymentFilterPaid' },
  { value: 'unpaid', labelKey: 'athlete.paymentFilterUnpaid' },
]

const methodChips: Array<{ value: AthletePayMethodFilter, labelKey: string }> = [
  { value: 'all', labelKey: 'athlete.paymentFilterAll' },
  { value: 'cash', labelKey: 'athlete.paymentFilterCash' },
  { value: 'ipg', labelKey: 'athlete.paymentFilterIpg' },
  { value: 'wallet', labelKey: 'athlete.paymentFilterWallet' },
]

const sortOptions: AthletePaySortKey[] = ['date', 'amount', 'status']

const hasFilters = computed(() => (
  statusFilter.value !== 'all'
  || methodFilter.value !== 'all'
  || Boolean(dateFrom.value || dateTo.value)
  || sortKey.value !== 'date'
  || sortDir.value !== 'desc'
))

const filteredPayments = computed(() => selectAthletePayments(data.value?.payments || [], {
  status: statusFilter.value,
  method: methodFilter.value,
  dateFrom: dateFrom.value || undefined,
  dateTo: dateTo.value || undefined,
  sortKey: sortKey.value,
  sortDir: sortDir.value,
}))

function clearFilters() {
  statusFilter.value = 'all'
  methodFilter.value = 'all'
  dateFrom.value = ''
  dateTo.value = ''
  sortKey.value = 'date'
  sortDir.value = 'desc'
}

function toggleSort(key: AthletePaySortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = key
  sortDir.value = 'desc'
}

function ariaSort(key: AthletePaySortKey): 'none' | 'ascending' | 'descending' {
  if (sortKey.value !== key) return 'none'
  return sortDir.value === 'asc' ? 'ascending' : 'descending'
}

function sortLabel(key: AthletePaySortKey) {
  if (key === 'amount') return t('athlete.paymentColAmount')
  if (key === 'status') return t('athlete.paymentColStatus')
  return t('athlete.paymentColDate')
}

function statusLabel(status: string) {
  return t(`booking.paymentStatus.${status}`)
}

function methodLabel(method: string) {
  if (method === 'IPG') return t('athlete.paymentMethodIpg')
  if (method === 'CASH') return t('athlete.paymentMethodCash')
  if (method === 'PAID') return t('athlete.paymentMethodWallet')
  return t('athlete.paymentMethodUnpaid')
}

function methodBadgeClass(method: string) {
  if (method === 'IPG') return 'canva-finance-method-badge-ipg'
  if (method === 'CASH') return 'canva-finance-method-badge-cash'
  if (method === 'PAID') return 'canva-finance-method-badge-wallet'
  return 'canva-finance-method-badge-unpaid'
}

function rowTitle(row: PaymentRow) {
  if (row.kind === 'topup') return t('athlete.walletTypeTopUp')
  const base = row.title || t('home.bookCourt')
  if (!row.club) return base
  return `${base} · ${localizedField(row.club, 'nameFa', 'nameEn')}`
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

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="table">
      <div class="space-y-2">
        <h2 class="text-sm font-bold text-brand-primary text-start">{{ t('athlete.paymentHistoryTitle') }}</h2>

        <template v-if="data?.payments?.length">
          <div class="space-y-2 text-start">
            <div>
              <span class="mb-1 block text-xs font-bold text-brand-navy">{{ t('athlete.paymentFilterStatus') }}</span>
              <div class="canva-history-chips" role="group" :aria-label="t('athlete.paymentFilterStatus')">
                <button
                  v-for="chip in statusChips"
                  :key="chip.value"
                  type="button"
                  class="canva-history-chip"
                  :class="{ 'canva-history-chip-on': statusFilter === chip.value }"
                  :aria-pressed="statusFilter === chip.value"
                  @click="statusFilter = chip.value"
                >
                  {{ t(chip.labelKey) }}
                </button>
              </div>
            </div>

            <div>
              <span class="mb-1 block text-xs font-bold text-brand-navy">{{ t('athlete.paymentFilterMethod') }}</span>
              <div class="canva-history-chips" role="group" :aria-label="t('athlete.paymentFilterMethod')">
                <button
                  v-for="chip in methodChips"
                  :key="chip.value"
                  type="button"
                  class="canva-history-chip"
                  :class="{ 'canva-history-chip-on': methodFilter === chip.value }"
                  :aria-pressed="methodFilter === chip.value"
                  @click="methodFilter = chip.value"
                >
                  {{ t(chip.labelKey) }}
                </button>
              </div>
            </div>

            <div>
              <span class="mb-1 block text-xs font-bold text-brand-navy">{{ t('athlete.paymentFilterDate') }}</span>
              <span class="flex gap-2">
                <input
                  v-model="dateFrom"
                  type="date"
                  dir="ltr"
                  class="canva-finance-date tabular-nums"
                  :aria-label="`${t('athlete.paymentFilterDate')} ${t('owner.financeTable.dateFrom')}`"
                >
                <input
                  v-model="dateTo"
                  type="date"
                  dir="ltr"
                  class="canva-finance-date tabular-nums"
                  :aria-label="`${t('athlete.paymentFilterDate')} ${t('owner.financeTable.dateTo')}`"
                >
              </span>
            </div>

            <label class="flex flex-wrap items-center gap-2 text-xs font-bold text-brand-navy min-[431px]:hidden">
              <span>{{ t('athlete.paymentSortBy') }}</span>
              <select v-model="sortKey" class="canva-finance-date" dir="rtl">
                <option v-for="key in sortOptions" :key="key" :value="key">{{ sortLabel(key) }}</option>
              </select>
              <button
                type="button"
                class="canva-history-chip"
                @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
              >
                {{ sortDir === 'asc' ? '↑' : '↓' }}
              </button>
            </label>

            <button
              v-if="hasFilters"
              type="button"
              class="canva-history-chip"
              @click="clearFilters"
            >
              {{ t('athlete.paymentClearFilters') }}
            </button>
          </div>

          <div v-if="filteredPayments.length" class="canva-athlete-pay-table-wrap">
            <table class="canva-finance-table">
              <thead>
                <tr>
                  <th>{{ t('athlete.paymentColTitle') }}</th>
                  <th :aria-sort="ariaSort('date')">
                    <button type="button" class="canva-finance-sort" @click="toggleSort('date')">
                      {{ t('athlete.paymentColDate') }}
                      <span v-if="sortKey === 'date'" aria-hidden="true">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
                    </button>
                  </th>
                  <th :aria-sort="ariaSort('status')">
                    <button type="button" class="canva-finance-sort" @click="toggleSort('status')">
                      {{ t('athlete.paymentColStatus') }}
                      <span v-if="sortKey === 'status'" aria-hidden="true">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
                    </button>
                  </th>
                  <th>{{ t('athlete.paymentColMethod') }}</th>
                  <th :aria-sort="ariaSort('amount')">
                    <button type="button" class="canva-finance-sort" @click="toggleSort('amount')">
                      {{ t('athlete.paymentColAmount') }}
                      <span v-if="sortKey === 'amount'" aria-hidden="true">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
                    </button>
                  </th>
                  <th>{{ t('athlete.paymentColAction') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in filteredPayments" :key="row.id">
                  <td class="font-bold text-brand-navy">{{ rowTitle(row) }}</td>
                  <td class="tabular-nums whitespace-nowrap">
                    <template v-if="row.date">
                      {{ formatDate(row.date) }}
                      <template v-if="row.startTime">
                        · <bdi dir="ltr" class="tabular-nums">{{ formatTimeLabel(row.startTime) }}</bdi>
                      </template>
                    </template>
                    <template v-else>{{ formatDate(row.createdAt) }}</template>
                  </td>
                  <td class="whitespace-nowrap">{{ statusLabel(row.status) }}</td>
                  <td>
                    <span class="canva-finance-method-badge" :class="methodBadgeClass(row.method)">
                      {{ methodLabel(row.method) }}
                    </span>
                  </td>
                  <td class="tabular-nums font-bold whitespace-nowrap">{{ formatCurrency(row.amount) }}</td>
                  <td>
                    <button
                      v-if="row.bookingId && canPayOnline(row.status)"
                      type="button"
                      class="canva-gate-btn-primary px-2 py-1.5 text-xs whitespace-nowrap"
                      :class="{ 'canva-cta-busy': payingId === row.bookingId }"
                      :aria-busy="payingId === row.bookingId"
                      @click="retryPay(row)"
                    >
                      {{ payingId === row.bookingId ? t('booking.redirectingToGateway') : t('booking.payNow') }}
                    </button>
                    <span v-else class="text-brand-gray-400">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="canva-panel text-sm text-brand-gray-600 text-start">
            {{ t('athlete.paymentHistoryEmptyFiltered') }}
          </p>
        </template>
        <p v-else class="canva-panel text-sm text-brand-gray-600 text-start">{{ t('athlete.paymentHistoryEmpty') }}</p>
      </div>
    </AppAsyncState>
  </div>
</template>

<style scoped>
.canva-athlete-pay-table-wrap {
  display: block;
  overflow-x: auto;
  border: 1px solid #e8e4de;
  background: #fff;
  border-radius: var(--sz-canva-radius);
}
</style>
