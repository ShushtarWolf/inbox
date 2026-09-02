<script setup lang="ts">
import { hasOwnerPermission, parsePermissions } from '#shared/ownerPermissions.ts'
import { isUnpaidPaymentStatus } from '#shared/bookingPayment.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

type OwnerFinanceTransaction = {
  id: string
  guestName: string
  paymentStatus: string
  amount: number
  bookingStatus: string
  kind?: string
  sessionType?: 'free' | 'coach' | string
  coachName?: string | null
  reservationLabel: string
  unpaid?: boolean
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
const { data, pending, error, refresh } = await useAuthedFetch<OwnerFinanceResponse>('/api/owner/finance', {
  key: 'owner-finance-report',
})
useOwnerClubRefresh(refresh)
const { formatCurrency, formatNumber } = useFormatters()
const { pilotNoCoach } = usePilotFlags()
const sessionFilter = ref<'all' | 'free' | 'coach'>('all')

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
  return t(`booking.status.${status}`)
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

const visibleTransactions = computed(() => {
  let list = data.value?.transactions || []
  if (pilotNoCoach.value) list = list.filter((tx) => tx.kind !== 'coach')
  if (pilotNoCoach.value || sessionFilter.value === 'all') return list
  return list.filter((tx) => {
    const isCoach = tx.kind === 'coach' || tx.sessionType === 'coach'
    return sessionFilter.value === 'coach' ? isCoach : !isCoach
  })
})

const sessionFilterOptions = computed(() => ([
  { value: 'all' as const, label: t('owner.financePage.sessionFilterAll') },
  { value: 'free' as const, label: t('owner.financePage.sessionFilterFree') },
  { value: 'coach' as const, label: t('owner.financePage.sessionFilterCoach') },
]))

function isCoachTx(tx: OwnerFinanceTransaction) {
  return tx.kind === 'coach' || tx.sessionType === 'coach'
}

function downloadReport() {
  if (!import.meta.client || !data.value) return
  const rows = [
    ['metric', 'value'],
    ['activeContacts', String(data.value.segments?.activeContacts ?? '')],
    ['churnRisk', String(data.value.segments?.churnRisk ?? data.value.stats?.churnRisk ?? '')],
    ['waitlist', String(data.value.segments?.waitlist ?? '')],
    ['cancellationsThisMonth', String(data.value.segments?.cancellationsThisMonth ?? data.value.segments?.cancellations ?? '')],
    ['ltv', String(data.value.stats?.ltv || 0)],
    ['noShowRate', String(data.value.stats?.noShowRate || 0)],
    ['revenue', String(data.value.stats?.revenue || 0)],
    ['unpaid', String(data.value.stats?.unpaid || 0)],
  ]
  const csv = rows.map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'inbox-finance-report.csv'
  a.click()
  URL.revokeObjectURL(url)
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

        <button type="button" class="canva-black-cta canva-report-span" @click="downloadReport">
          {{ t('owner.financePage.downloadReport') }}
        </button>

        <div class="space-y-3 canva-report-span">
          <h2 class="text-start text-base font-bold text-brand-navy">{{ t('owner.financePage.recentTransactions') }}</h2>
          <div
            v-if="!pilotNoCoach"
            class="canva-session-filter-row"
            role="group"
            :aria-label="t('owner.sessionTypeFilterHint')"
          >
            <button
              v-for="opt in sessionFilterOptions"
              :key="opt.value"
              type="button"
              class="canva-session-filter-btn"
              :class="sessionFilter === opt.value ? 'canva-session-filter-btn-on' : ''"
              @click="sessionFilter = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
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
                <p class="mt-0.5 text-xs text-brand-gray-600">{{ tx.guestName }}</p>
                <span
                  v-if="isCoachTx(tx)"
                  class="canva-slot-coach-chip mt-1"
                >{{ t('owner.financePage.sessionCoachTag') }}</span>
                <p class="mt-1 text-[11px] text-brand-gray-500">
                  {{ paymentStatusLabel(tx.paymentStatus) }} · {{ bookingStatusLabel(tx.bookingStatus) }}
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
