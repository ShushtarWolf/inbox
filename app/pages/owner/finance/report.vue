<script setup lang="ts">
import { hasOwnerPermission, parsePermissions } from '#shared/ownerPermissions.ts'
import { isUnpaidPaymentStatus } from '#shared/bookingPayment.ts'
import { financeSheetXml, saveFinanceSheet } from '#shared/financeSpreadsheet.ts'
import { selectFinanceTransactions, type FinanceBookingKindFilter, type FinanceLegendFilter, type FinancePaymentFilter, type FinanceTxSortDir, type FinanceTxSortKey } from '#shared/financeTransactions.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

type OwnerFinanceTransaction = {
  id: string
  guestName: string
  guestMobile?: string | null
  paymentMethod?: string | null
  paymentStatus: string
  amount: number
  bookingStatus: string
  displayStatus?: string | null
  comments?: string | null
  isRecurring?: boolean | null
  kind?: string
  bookingKind?: 'normal' | 'package' | 'coach' | string
  sessionType?: 'free' | 'coach' | string
  coachName?: string | null
  reservationLabel: string
  reservedAt: string
  paidAt?: string | null
  unpaid?: boolean
  discountCode?: string | null
  discountPercent?: number | null
  discountAmount?: number | null
  subtotalBeforeDiscount?: number | null
  complimentary?: boolean
}

type OwnerFinanceStats = {
  revenue?: number
  unpaid?: number
  ltv?: number | null
  churnRisk?: number
  noShowRate?: number | null
}

type OwnerFinanceSegments = {
  activeContacts?: number
  churnRisk?: number
  waitlist?: number
  cancellations?: number
  cancellationsThisMonth?: number
}

type OwnerFinanceFunnel = {
  confirmed?: number
  total?: number
}

type OwnerFinanceResponse = {
  stats?: OwnerFinanceStats
  segments?: OwnerFinanceSegments
  funnel?: OwnerFinanceFunnel
  transactions?: OwnerFinanceTransaction[]
}

const { t } = useI18n()
const { user, fetch: fetchAuth } = useAuth()
const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })
const sessionFilter = ref<'all' | 'free' | 'coach'>('all')
const bookingKind = ref<FinanceBookingKindFilter>('all')
const paymentFilter = ref<FinancePaymentFilter>('all')
const legendFilter = ref<FinanceLegendFilter>('all')
const guestQuery = ref('')
const discountQuery = ref('')
const reservedFrom = ref('')
const reservedTo = ref('')
const paidFrom = ref('')
const paidTo = ref('')
const sortKey = ref<FinanceTxSortKey>('reservedAt')
const sortDir = ref<FinanceTxSortDir>('desc')
const financeQuery = computed(() => {
  const q: Record<string, string | number> = { txLimit: 1000 }
  if (reservedFrom.value) q.txFrom = reservedFrom.value
  if (reservedTo.value) q.txTo = reservedTo.value
  if (legendFilter.value === 'free' || legendFilter.value === 'blocked') q.legend = legendFilter.value
  return q
})
const { data, pending, error, refresh } = await useAuthedFetch<OwnerFinanceResponse>('/api/owner/finance', {
  key: 'owner-finance-report',
  query: financeQuery,
})
useOwnerClubRefresh(refresh)
const { formatCurrency, formatNumber, formatDate, formatTimeLabel } = useFormatters()
const { pilotNoCoach } = usePilotFlags()

onMounted(() => {
  fetchAuth()
  refresh()
})

const activeMembership = computed(() => {
  const memberships = user.value?.memberships || []
  return memberships.find((item) => item.club.id === selectedClubId.value) || memberships[0]
})
const permissions = computed(() => parsePermissions(activeMembership.value?.permissionsJson))
const isOwner = computed(() => activeMembership.value?.role === 'OWNER')
const canReports = computed(() => isOwner.value || hasOwnerPermission(permissions.value, 'finance:reports'))
const reportsGatePending = computed(() => Boolean(user.value) && !(user.value?.memberships?.length))
const showReports = computed(() => canReports.value || reportsGatePending.value)

function bookingStatusLabel(status: string) {
  if (!status) return ''
  const key = `booking.status.${status}`
  const label = t(key)
  return label === key ? t(`owner.status.${status}`) : label
}

function paymentStatusLabel(status: string) {
  return t(`booking.paymentStatus.${status}`)
}

function isTxUnpaid(tx: { unpaid?: boolean; paymentStatus?: string; bookingStatus?: string }) {
  if (typeof tx.unpaid === 'boolean') return tx.unpaid
  return tx.bookingStatus !== 'CANCELLED' && isUnpaidPaymentStatus(tx.paymentStatus)
}

function metricOrDash(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return formatNumber(Number(value))
}

const segments = computed(() => data.value?.segments)
const stats = computed(() => data.value?.stats)

/** Canva signals — map to segments / stats; never invent. */
const signalCards = computed(() => [
  {
    key: 'activeAudience',
    label: t('owner.financeCards.activeAudience'),
    value: metricOrDash(segments.value?.activeContacts),
    danger: false,
  },
  {
    key: 'churnRisk',
    label: t('owner.financeCards.churnAtRisk'),
    value: metricOrDash(segments.value?.churnRisk ?? stats.value?.churnRisk),
    danger: true,
  },
  {
    key: 'waitlist',
    label: t('owner.financeCards.waitlist'),
    value: metricOrDash(segments.value?.waitlist),
    danger: false,
  },
  {
    key: 'cancelsMonth',
    label: t('owner.financeCards.cancelsThisMonth'),
    value: metricOrDash(segments.value?.cancellationsThisMonth ?? segments.value?.cancellations),
    danger: false,
  },
])

const avgLtvLabel = computed(() => {
  const value = stats.value?.ltv
  if (value === null || value === undefined) return '—'
  return formatCurrency(value)
})

const noShowRateLabel = computed(() => {
  const value = stats.value?.noShowRate
  if (value === null || value === undefined) return '—'
  return `${formatNumber(value)}٪`
})

const visibleTransactions = computed(() => selectFinanceTransactions(data.value?.transactions || [], {
  hideCoach: pilotNoCoach.value,
  session: sessionFilter.value,
  bookingKind: bookingKind.value,
  payment: paymentFilter.value,
  legend: legendFilter.value,
  guest: guestQuery.value,
  discountCode: discountQuery.value,
  reservedFrom: reservedFrom.value,
  reservedTo: reservedTo.value,
  paidFrom: paidFrom.value,
  paidTo: paidTo.value,
  sortKey: sortKey.value,
  sortDir: sortDir.value,
}))

function stampDate(stamp?: string | null) {
  if (!stamp) return ''
  return formatDate(stamp.slice(0, 10))
}

function stampTime(stamp?: string | null) {
  if (!stamp || stamp.length < 16) return ''
  return formatTimeLabel(stamp.slice(11, 16))
}

function isCoachTx(tx: OwnerFinanceTransaction) {
  return tx.kind === 'coach' || tx.sessionType === 'coach'
}

function kindLabel(kind?: string | null) {
  if (kind === 'package') return t('owner.financeTable.bookingKindPackage')
  if (kind === 'coach') return t('owner.financeTable.bookingKindCoach')
  return t('owner.financeTable.bookingKindNormal')
}

function methodLabel(method?: string | null) {
  if (method === 'IPG') return t('owner.financePage.methodCashless')
  if (method === 'CASH' || method === 'PAID') return t('owner.financePage.methodCash')
  return t('owner.financePage.methodUnpaid')
}

function downloadReport() {
  const headers = [
    t('owner.financeTable.reservation'),
    t('owner.financeTable.bookingKind'),
    t('owner.financeTable.guest'),
    t('owner.guestMobile'),
    t('owner.financeTable.reservedAt'),
    t('owner.financeTable.paidAt'),
    t('owner.financeTable.method'),
    t('owner.financeTable.status'),
    t('owner.financeTable.income'),
    t('owner.financeTable.discountCode'),
    t('owner.financeTable.discountPercent'),
    t('owner.financeTable.discountAmount'),
    t('owner.financeTable.priceBeforeDiscount'),
  ]
  const rows = visibleTransactions.value.map((tx) => [
    tx.reservationLabel,
    kindLabel(tx.bookingKind),
    tx.guestName,
    tx.guestMobile || '',
    `${stampDate(tx.reservedAt)} ${stampTime(tx.reservedAt)}`.trim(),
    tx.paidAt ? `${stampDate(tx.paidAt)} ${stampTime(tx.paidAt)}`.trim() : '',
    tx.kind === 'slot' ? '' : methodLabel(tx.paymentMethod),
    tx.kind === 'slot' ? bookingStatusLabel(tx.bookingStatus) : paymentStatusLabel(tx.paymentStatus),
    tx.amount,
    tx.complimentary && !tx.discountCode ? t('owner.financeTable.complimentary') : (tx.discountCode || ''),
    tx.discountPercent || '',
    tx.discountAmount || '',
    tx.subtotalBeforeDiscount || '',
  ])
  saveFinanceSheet('inbox-finance.xls', financeSheetXml(headers, rows))
}
</script>

<template>
  <div class="venus-page-stack">
    <CanvaSubpageHeader to="/owner/finance" :title="t('owner.financePage.advancedReport')" />

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="stat-grid">
      <CanvaEmptyState v-if="!showReports && !reportsGatePending" :title="t('owner.financePage.reportsLocked')" icon="lock" />

      <template v-else-if="showReports">
        <div class="canva-report-wide">
        <section class="canva-report-span">
          <h2 class="mb-2 text-start text-sm font-bold text-brand-navy">{{ t('owner.financePage.customerSignals') }}</h2>
          <div class="canva-finance-signal-grid">
            <div v-for="card in signalCards" :key="card.key" class="canva-finance-signal-card">
              <p class="canva-finance-chip-label">{{ card.label }}</p>
              <p
                class="mt-1 text-xl font-bold tabular-nums"
                :class="card.danger && card.value !== '—' ? 'text-brand-primary' : 'text-brand-navy'"
              >
                {{ card.value }}
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 class="mb-2 text-start text-sm font-bold text-brand-navy">{{ t('owner.financePage.ltvTitle') }}</h2>
          <div class="grid grid-cols-2 gap-2">
            <div class="canva-finance-signal-card text-start">
              <p class="canva-finance-chip-label">{{ t('owner.financeCards.avgLtv') }}</p>
              <p class="mt-1 text-lg font-bold text-brand-navy">{{ avgLtvLabel }}</p>
            </div>
            <div class="canva-finance-signal-card text-start">
              <p class="canva-finance-chip-label">{{ t('owner.financeCards.noShowRate') }}</p>
              <p class="mt-1 text-xl font-bold text-brand-navy">{{ noShowRateLabel }}</p>
            </div>
          </div>
        </section>

        <section>
          <h2 class="mb-2 text-start text-sm font-bold text-brand-navy">{{ t('owner.financePage.funnelTitle') }}</h2>
          <div class="canva-finance-funnel-empty">
            <p>{{ t('owner.financePage.funnelPlaceholder') }}</p>
            <p v-if="data?.funnel" class="mt-2 text-sm font-bold text-brand-navy">
              {{ formatNumber(data.funnel.confirmed || 0) }} / {{ formatNumber(data.funnel.total || 0) }}
            </p>
          </div>
        </section>

        <div class="space-y-3 canva-report-span">
          <h2 class="text-start text-base font-bold text-brand-navy">{{ t('owner.financePage.recentTransactions') }}</h2>
          <OwnerFinanceTxFilters
            v-model:session="sessionFilter"
            v-model:booking-kind="bookingKind"
            v-model:payment="paymentFilter"
            v-model:legend="legendFilter"
            v-model:guest="guestQuery"
            v-model:discount-code="discountQuery"
            v-model:reserved-from="reservedFrom"
            v-model:reserved-to="reservedTo"
            v-model:paid-from="paidFrom"
            v-model:paid-to="paidTo"
            v-model:sort-key="sortKey"
            v-model:sort-dir="sortDir"
            :show-session="!pilotNoCoach"
            sort-mode="always"
          />
          <button type="button" class="canva-black-cta w-full" @click="downloadReport">
            {{ t('owner.financeTable.downloadExcel') }}
          </button>
          <CanvaEmptyState v-if="!visibleTransactions.length" :title="t('common.empty')" icon="receipt_long" />
          <div v-else class="space-y-2">
            <div
              v-for="tx in visibleTransactions"
              :key="tx.id"
              class="canva-finance-tx-card"
              :class="isTxUnpaid(tx) ? 'border-amber-200 bg-amber-50/60' : ''"
            >
              <div class="min-w-0 flex-1 text-start">
                <p class="text-sm font-bold text-brand-navy">{{ tx.reservationLabel }}</p>
                <p class="mt-0.5 text-xs tabular-nums text-brand-gray-600">
                  {{ stampDate(tx.reservedAt) }}
                  <bdi dir="ltr">{{ stampTime(tx.reservedAt) }}</bdi>
                </p>
                <p v-if="tx.paidAt" class="mt-0.5 text-xs tabular-nums text-brand-gray-500">
                  {{ t('owner.financeTable.paidAt') }}
                  {{ stampDate(tx.paidAt) }}
                  <bdi dir="ltr">{{ stampTime(tx.paidAt) }}</bdi>
                </p>
                <p v-if="tx.guestName" class="mt-0.5 text-xs text-brand-gray-600">{{ tx.guestName }}</p>
                <p v-if="tx.discountCode || tx.discountAmount" class="mt-0.5 text-xs text-brand-primary">
                  <bdi v-if="tx.discountCode" dir="ltr">{{ tx.discountCode }}</bdi>
                  <template v-else-if="tx.complimentary">{{ t('owner.financeTable.complimentary') }}</template>
                  <template v-if="tx.discountAmount"> −{{ formatCurrency(tx.discountAmount) }}</template>
                </p>
                <span
                  v-if="isCoachTx(tx)"
                  class="canva-slot-coach-chip mt-1"
                >{{ t('owner.financeTable.sessionCoachTag') }}</span>
                <p class="mt-1 text-[11px] text-brand-gray-500">
                  <template v-if="tx.kind === 'slot'">{{ bookingStatusLabel(tx.bookingStatus) }}</template>
                  <template v-else>{{ paymentStatusLabel(tx.paymentStatus) }} · {{ bookingStatusLabel(tx.bookingStatus) }}</template>
                </p>
              </div>
              <p class="shrink-0 font-bold" :class="isTxUnpaid(tx) ? 'text-amber-700' : 'text-brand-primary'">
                {{ formatCurrency(tx.amount) }}
              </p>
            </div>
          </div>
        </div>
        </div>
      </template>
    </AppAsyncState>
  </div>
</template>
