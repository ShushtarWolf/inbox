<script setup lang="ts">
import { hasOwnerPermission, parsePermissions } from '#shared/ownerPermissions.ts'
import { isUnpaidPaymentStatus } from '#shared/bookingPayment.ts'
import { financeSheetXml, saveFinanceSheet } from '#shared/financeSpreadsheet.ts'
import { selectFinanceTransactions, type FinanceBookingKindFilter, type FinanceLegendFilter, type FinancePaymentFilter, type FinanceTxSortDir, type FinanceTxSortKey } from '#shared/financeTransactions.ts'

/** Canva finance — black income hero + method bar + txn sheet. */
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
  unpaidAmount?: number | null
  bookingsToday?: number
  noShowsToday?: number | null
}

type OwnerFinancePaymentBreakdown = {
  PAID_CASH?: number
  PAID_IPG?: number
  UNPAID?: number
  CASH?: number
  IPG?: number
  NOT_PAID?: number
}

type OwnerFinanceResponse = {
  stats?: OwnerFinanceStats
  weeklyRevenue?: number[]
  weekLabels?: string[]
  paymentBreakdown?: OwnerFinancePaymentBreakdown
  transactions?: OwnerFinanceTransaction[]
}

type OwnerSettlementWithdraw = {
  id: string
  amount: number
}

type OwnerSettlementLedgerEntry = {
  id: string
  ownerNet: number
  classDate?: string | null
  clawedBackAt?: string | Date | null
}

type OwnerSettlementResponse = {
  sheba?: string | null
  commissionBps?: number
  balance?: number
  withdrawableBalance?: number
  pendingClassBalance?: number
  pendingWithdraws?: OwnerSettlementWithdraw[]
  ledger?: OwnerSettlementLedgerEntry[]
}

const { t } = useI18n()
const localePath = useLocalePath()
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
  query: financeQuery,
})
const { data: settlement, refresh: refreshSettlement } = await useAuthedFetch<OwnerSettlementResponse>('/api/owner/settlement', {
  immediate: false,
  watch: false,
})
const { formatCurrency, formatNumber, formatDate, formatWeekday, formatDayNumber, formatMonth, formatPhone, formatTimeLabel } = useFormatters()
const { today } = useLocalDate()
const { pilotNoCoach } = usePilotFlags()
const { fetchErrorMessage } = useFetchError()

onMounted(() => { fetchAuth() })

const period = ref<'day' | 'week' | 'month'>('day')
const selectedTx = ref<OwnerFinanceTransaction | null>(null)
const shebaInput = ref('')
const withdrawAmount = ref<number | null>(null)
const payoutBusy = ref(false)
const payoutError = ref('')
const payoutSuccess = ref('')

const activeMembership = computed(() => {
  const memberships = user.value?.memberships || []
  return memberships.find((item) => item.club.id === selectedClubId.value) || memberships[0]
})
const permissions = computed(() => parsePermissions(activeMembership.value?.permissionsJson))
const isOwner = computed(() => activeMembership.value?.role === 'OWNER')
const canReports = computed(() => isOwner.value || hasOwnerPermission(permissions.value, 'finance:reports'))
const canTransactions = computed(() => isOwner.value || hasOwnerPermission(permissions.value, 'finance:transactions'))
const canPayouts = computed(() => isOwner.value || hasOwnerPermission(permissions.value, 'finance:payouts'))
/** Avoid false lock before /api/auth/me hydrates memberships. */
const reportsGatePending = computed(() => Boolean(user.value) && !(user.value?.memberships?.length))
const showReports = computed(() => canReports.value || reportsGatePending.value)
const showTransactions = computed(() => canTransactions.value || reportsGatePending.value)
/** Settlement UI for all payment modes (desk + online ledger). */
const showPayoutsSection = computed(() => canPayouts.value || reportsGatePending.value)

useOwnerClubRefresh(() => {
  refresh()
  if (showPayoutsSection.value) refreshSettlement()
})

watch(showPayoutsSection, (show) => {
  if (show) refreshSettlement()
}, { immediate: true })

watch(settlement, (value) => {
  if (value?.sheba) shebaInput.value = value.sheba
}, { immediate: true })

const commissionPct = computed(() => Math.round(Number(settlement.value?.commissionBps || 0) / 100))

async function saveSheba() {
  payoutBusy.value = true
  payoutError.value = ''
  payoutSuccess.value = ''
  try {
    await $fetch('/api/owner/sheba', {
      method: 'PATCH',
      body: { sheba: shebaInput.value.trim() || null },
    })
    payoutSuccess.value = t('owner.financePage.shebaSaved')
    await refreshSettlement()
  } catch (error: unknown) {
    payoutError.value = fetchErrorMessage(error, t('owner.financePage.shebaInvalid'))
  } finally {
    payoutBusy.value = false
  }
}

async function submitWithdraw() {
  payoutBusy.value = true
  payoutError.value = ''
  payoutSuccess.value = ''
  try {
    if (!settlement.value?.sheba) {
      payoutError.value = t('owner.financePage.withdrawNeedSheba')
      return
    }
    const amount = Number(withdrawAmount.value ?? 0)
    const withdrawable = Number(settlement.value?.withdrawableBalance ?? 0)
    if (amount > withdrawable) {
      payoutError.value = t('owner.financePage.withdrawInsufficient')
      return
    }
    await $fetch('/api/owner/withdraw', {
      method: 'POST',
      body: { amount },
    })
    payoutSuccess.value = t('owner.financePage.withdrawSuccess')
    withdrawAmount.value = null
    await refreshSettlement()
  } catch (error: unknown) {
    payoutError.value = fetchErrorMessage(error, t('common.error'))
  } finally {
    payoutBusy.value = false
  }
}

function formatWeekLabel(iso?: string) {
  if (!iso) return ''
  return formatDate(iso)
}

/** Canva x-axis: single Persian weekday letter. */
function weekdayLetter(iso?: string) {
  if (!iso) return ''
  const short = formatWeekday(iso, 'short')
  return short.slice(0, 1)
}

const weekly = computed(() => data.value?.weeklyRevenue || [])
const todayRevenue = computed(() => weekly.value[weekly.value.length - 1] || 0)
const yesterdayRevenue = computed(() => weekly.value[weekly.value.length - 2] || 0)
const vsYesterdayPct = computed(() => {
  const todayAmt = todayRevenue.value
  const yesterday = yesterdayRevenue.value
  if (!yesterday) return todayAmt ? 100 : 0
  return Math.round(((todayAmt - yesterday) / yesterday) * 100)
})
const vsYesterdayLabel = computed(() => {
  const pct = vsYesterdayPct.value
  if (pct > 0) return t('owner.financePage.vsYesterdayUp', { pct: formatNumber(pct) })
  if (pct < 0) return t('owner.financePage.vsYesterdayDown', { pct: formatNumber(Math.abs(pct)) })
  return t('owner.financePage.vsYesterdayFlat')
})

const heroAmount = computed(() => {
  if (period.value === 'day') return todayRevenue.value
  if (period.value === 'week') return weekly.value.reduce((sum: number, n: number) => sum + n, 0)
  return Number(data.value?.stats?.revenue || 0)
})

const heroDateLabel = computed(() => {
  const iso = today()
  return `${formatWeekday(iso, 'long')} ${formatDayNumber(iso)} ${formatMonth(iso, 'long')}`
})

const heroTitle = computed(() => {
  if (period.value === 'day') return t('owner.financePage.todayRevenueDated', { date: heroDateLabel.value })
  if (period.value === 'week') return t('owner.financePage.weekRevenue')
  return t('owner.financePage.monthRevenue')
})

const maxWeeklyRevenue = computed(() => Math.max(...weekly.value, 0))
const isChartEmpty = computed(() => !weekly.value.some((amount: number) => amount > 0))
const chartAreaHeight = 140
/** Canva: today (last day in weekly series) is the red bar. */
const activeChartIndex = computed(() => Math.max(weekly.value.length - 1, 0))

function barHeightPx(amount: number) {
  if (!amount || !maxWeeklyRevenue.value) return 0
  return Math.max(12, Math.round((amount / maxWeeklyRevenue.value) * chartAreaHeight))
}

function isTxUnpaid(tx: { unpaid?: boolean; paymentStatus?: string; bookingStatus?: string }) {
  if (typeof tx.unpaid === 'boolean') return tx.unpaid
  return tx.bookingStatus !== 'CANCELLED' && isUnpaidPaymentStatus(tx.paymentStatus)
}

function bookingStatusLabel(status: string) {
  if (!status) return ''
  const key = `booking.status.${status}`
  const label = t(key)
  return label === key ? t(`owner.status.${status}`) : label
}

function paymentStatusLabel(status: string) {
  return t(`booking.paymentStatus.${status}`)
}

function methodBadgeClass(method?: string | null) {
  if (method === 'IPG') return 'canva-finance-method-badge-ipg'
  if (method === 'CASH' || method === 'PAID') return 'canva-finance-method-badge-cash'
  return 'canva-finance-method-badge-unpaid'
}

function methodBadgeLabel(method?: string | null) {
  if (method === 'IPG') return t('owner.financePage.methodCashless')
  if (method === 'CASH' || method === 'PAID') return t('owner.financePage.methodCash')
  return t('owner.financePage.methodUnpaid')
}

/** Canva day chips: رزروها / پرداخت‌نشده / عدم حضور — unpaidAmount is desk receivables, not payout. */
const unpaidAmount = computed(() => data.value?.stats?.unpaidAmount)
const hasUnpaidReceivables = computed(() => Number(unpaidAmount.value || 0) > 0)

const summaryChips = computed(() => {
  const unpaidAmt = unpaidAmount.value
  const noShows = data.value?.stats?.noShowsToday
  return [
    {
      key: 'bookings',
      label: t('owner.financeCards.bookings'),
      value: formatNumber(data.value?.stats?.bookingsToday ?? 0),
    },
    {
      key: 'pendingSettlement',
      label: t('owner.financeCards.pendingSettlement'),
      value: unpaidAmt == null ? '—' : formatCurrency(unpaidAmt),
    },
    {
      key: 'noShows',
      label: t('owner.financeCards.noShows'),
      value: noShows == null ? '—' : formatNumber(noShows),
    },
  ]
})

const cashPctRaw = computed(() => Number(data.value?.paymentBreakdown?.PAID_CASH ?? data.value?.paymentBreakdown?.CASH ?? 0))
const ipgPctRaw = computed(() => Number(data.value?.paymentBreakdown?.PAID_IPG ?? data.value?.paymentBreakdown?.IPG ?? 0))
const unpaidPct = computed(() => Number(data.value?.paymentBreakdown?.UNPAID ?? data.value?.paymentBreakdown?.NOT_PAID ?? 0))

/** Canva method bar is cash vs gateway only (paid share). */
const cashPct = computed(() => {
  const sum = cashPctRaw.value + ipgPctRaw.value
  return sum ? Math.round((cashPctRaw.value / sum) * 100) : 0
})
const ipgPct = computed(() => {
  const sum = cashPctRaw.value + ipgPctRaw.value
  return sum ? Math.round((ipgPctRaw.value / sum) * 100) : 0
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

function kindLabel(kind?: string | null) {
  if (kind === 'package') return t('owner.financeTable.bookingKindPackage')
  if (kind === 'coach') return t('owner.financeTable.bookingKindCoach')
  return t('owner.financeTable.bookingKindNormal')
}

function downloadExcel() {
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
    tx.kind === 'slot' ? '' : methodBadgeLabel(tx.paymentMethod),
    tx.kind === 'slot' ? bookingStatusLabel(tx.bookingStatus) : paymentStatusLabel(tx.paymentStatus),
    tx.amount,
    tx.complimentary && !tx.discountCode ? t('owner.financeTable.complimentary') : (tx.discountCode || ''),
    tx.discountPercent || '',
    tx.discountAmount || '',
    tx.subtotalBeforeDiscount || '',
  ])
  saveFinanceSheet('inbox-finance.xls', financeSheetXml(headers, rows))
}

function toggleSort(key: FinanceTxSortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = key
  sortDir.value = key === 'guest' || key === 'reservation' || key === 'method' ? 'asc' : 'desc'
}

function ariaSort(key: FinanceTxSortKey) {
  if (sortKey.value !== key) return 'none'
  return sortDir.value === 'asc' ? 'ascending' : 'descending'
}

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

function openTx(tx: OwnerFinanceTransaction) {
  selectedTx.value = tx
}

function closeTx() {
  selectedTx.value = null
}

/** Chip and hint stay on this page: filter the ledger to unpaid and scroll to it. */
function showUnpaidList() {
  paymentFilter.value = 'unpaid'
  nextTick(() => {
    document.getElementById('owner-finance-tx')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}
</script>

<template>
  <div class="venus-page-stack">
    <section class="canva-photo-hero -mx-4 sm:-mx-0">
      <CanvaHeroImg
        src="/hero/fitness-venue.jpg"
        alt=""
        img-class="canva-photo-hero-media"
        img-style="filter: grayscale(0.55) brightness(0.72);"
        fetchpriority="high"
      />
      <div class="canva-photo-hero-wash" />
      <CanvaOwnerHeroChrome />
      <div class="canva-promo-badge canva-promo-badge-hero pointer-events-none" aria-hidden="true">
        <span class="canva-promo-badge-pct">۲۰٪</span>
        <span class="canva-promo-badge-label">{{ t('owner.calendarPromoShort') }}</span>
      </div>
      <div class="canva-photo-hero-body !min-h-[9.5rem] !pb-8" />
    </section>

    <div class="canva-cal-sheet -mx-4 min-[431px]:mx-0">
    <div class="canva-finance-period">
      <button
        type="button"
        class="canva-finance-period-btn"
        :class="period === 'day' ? 'canva-finance-period-active' : ''"
        @click="period = 'day'"
      >{{ t('owner.financePage.periodDay') }}</button>
      <button
        type="button"
        class="canva-finance-period-btn"
        :class="period === 'week' ? 'canva-finance-period-active' : ''"
        @click="period = 'week'"
      >{{ t('owner.financePage.periodWeek') }}</button>
      <button
        type="button"
        class="canva-finance-period-btn"
        :class="period === 'month' ? 'canva-finance-period-active' : ''"
        @click="period = 'month'"
      >{{ t('owner.financePage.periodMonth') }}</button>
    </div>

    <section class="canva-finance-hero-card">
      <p class="text-xs text-white/75">{{ heroTitle }}</p>
      <p class="mt-2 text-3xl font-bold tabular-nums text-white">{{ formatCurrency(heroAmount) }}</p>
      <p
        v-if="period === 'day'"
        class="mt-1 text-xs"
        :class="vsYesterdayPct > 0 ? 'text-emerald-400' : vsYesterdayPct < 0 ? 'text-amber-300' : 'text-white/80'"
      >
        {{ vsYesterdayLabel }}
      </p>
      <NuxtLink
        :to="localePath('/owner/finance/report')"
        class="canva-finance-report-link mt-4"
      >
        {{ t('owner.financePage.advancedReport') }}
      </NuxtLink>
    </section>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="stat-grid">
      <div class="canva-finance-wide">
      <div v-if="showReports" class="space-y-2">
        <div class="canva-finance-chips">
          <template v-for="chip in summaryChips" :key="chip.key">
            <button
              v-if="chip.key === 'pendingSettlement'"
              type="button"
              class="canva-finance-chip canva-finance-chip-link"
              @click="showUnpaidList"
            >
              <p class="canva-finance-chip-label">{{ chip.label }}</p>
              <p class="canva-finance-chip-value">{{ chip.value }}</p>
            </button>
            <div v-else class="canva-finance-chip">
              <p class="canva-finance-chip-label">{{ chip.label }}</p>
              <p class="canva-finance-chip-value">{{ chip.value }}</p>
            </div>
          </template>
        </div>
        <p v-if="hasUnpaidReceivables" class="text-start text-[11px] leading-5 text-brand-gray-500">
          {{ t('owner.financePage.unpaidChipHint') }}
          <button type="button" class="canva-finance-unpaid-cta ms-1" @click="showUnpaidList">
            {{ t('owner.financePage.unpaidChipCta') }}
          </button>
          {{ t('owner.financePage.unpaidChipClear') }}
        </p>
      </div>

      <div v-if="showReports" class="canva-panel">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-bold text-brand-navy">{{ t('owner.financePage.paymentMethodTitle') }}</h2>
          <div class="flex items-center gap-3 text-[10px] font-bold text-brand-gray-600">
            <span class="inline-flex items-center gap-1">
              <span class="canva-finance-legend-swatch bg-brand-primary" />
              {{ t('owner.financePage.methodCash') }}
            </span>
            <span class="inline-flex items-center gap-1">
              <span class="canva-finance-legend-swatch bg-[#E8B84A]" />
              {{ t('owner.financePage.methodCashless') }}
            </span>
          </div>
        </div>
        <div class="canva-finance-method-bar mt-3">
          <span class="h-full bg-brand-primary" :style="{ width: `${cashPct}%` }" />
          <span class="h-full bg-[#E8B84A]" :style="{ width: `${ipgPct}%` }" />
        </div>
        <div class="mt-2 flex justify-between text-xs font-bold text-brand-navy">
          <span>{{ formatNumber(cashPct) }}٪</span>
          <span>{{ formatNumber(ipgPct) }}٪</span>
        </div>
        <p v-if="unpaidPct > 0" class="mt-2 text-[11px] text-brand-gray-500">
          {{ t('owner.financePage.unpaidShareNote', { pct: formatNumber(unpaidPct) }) }}
        </p>
      </div>

      <div v-if="showReports" class="canva-panel">
        <h2 class="text-sm font-bold text-brand-navy">{{ t('owner.financePage.weeklyChart') }}</h2>
        <div v-if="isChartEmpty" class="mt-4 border border-dashed border-brand-gray-200 bg-brand-cream px-3 py-8 text-center text-sm text-brand-gray-500" style="border-radius: var(--sz-canva-radius);">
          {{ t('owner.financePage.chartEmpty') }}
        </div>
        <div v-else class="canva-finance-chart mt-4">
          <div class="flex items-end justify-between gap-2" :style="{ height: `${chartAreaHeight}px` }">
            <div
              v-for="(amount, index) in weekly"
              :key="data?.weekLabels?.[index] || index"
              class="flex h-full flex-1 flex-col items-center justify-end gap-1"
            >
              <div
                class="canva-finance-chart-bar"
                :class="index === activeChartIndex ? 'canva-finance-chart-bar-active' : ''"
                :style="{ height: `${barHeightPx(amount)}px` }"
                :title="`${formatWeekLabel(data?.weekLabels?.[index])} — ${formatCurrency(amount)}`"
              />
              <span
                class="canva-finance-chart-label"
                :class="index === activeChartIndex ? 'canva-finance-chart-label-active' : ''"
              >{{ weekdayLetter(data?.weekLabels?.[index]) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="showTransactions" id="owner-finance-tx" class="canva-finance-tx-col space-y-3">
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
          sort-mode="narrow"
        />
        <button type="button" class="canva-black-cta w-full" @click="downloadExcel">
          {{ t('owner.financeTable.downloadExcel') }}
        </button>
        <div v-if="visibleTransactions.length" class="canva-finance-tx-grid">
          <button
            v-for="tx in visibleTransactions"
            :key="tx.id"
            type="button"
            class="canva-finance-tx-card"
            @click="openTx(tx)"
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
              <span
                v-if="isCoachTx(tx)"
                class="canva-slot-coach-chip mt-1"
              >{{ t('owner.financeTable.sessionCoachTag') }}</span>
            </div>
            <div class="shrink-0 text-start">
              <p class="text-sm font-bold text-brand-navy">{{ formatCurrency(tx.amount) }}</p>
              <span v-if="tx.kind === 'slot'" class="canva-finance-method-badge mt-1">
                {{ bookingStatusLabel(tx.bookingStatus) }}
              </span>
              <span v-else class="canva-finance-method-badge mt-1" :class="methodBadgeClass(tx.paymentMethod)">
                {{ methodBadgeLabel(tx.paymentMethod) }}
              </span>
            </div>
          </button>
        </div>
        <div v-if="visibleTransactions.length" class="canva-finance-table-wrap">
          <table class="canva-finance-table">
            <thead>
              <tr>
                <th :aria-sort="ariaSort('reservation')">
                  <button type="button" class="canva-finance-sort" @click="toggleSort('reservation')">
                    {{ t('owner.financeTable.reservation') }}
                    <span v-if="sortKey === 'reservation'" aria-hidden="true">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
                  </button>
                </th>
                <th :aria-sort="ariaSort('reservedAt')">
                  <button type="button" class="canva-finance-sort" @click="toggleSort('reservedAt')">
                    {{ t('owner.financeTable.reservedAt') }}
                    <span v-if="sortKey === 'reservedAt'" aria-hidden="true">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
                  </button>
                </th>
                <th :aria-sort="ariaSort('paidAt')">
                  <button type="button" class="canva-finance-sort" @click="toggleSort('paidAt')">
                    {{ t('owner.financeTable.paidAt') }}
                    <span v-if="sortKey === 'paidAt'" aria-hidden="true">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
                  </button>
                </th>
                <th :aria-sort="ariaSort('guest')">
                  <button type="button" class="canva-finance-sort" @click="toggleSort('guest')">
                    {{ t('owner.financeTable.guest') }}
                    <span v-if="sortKey === 'guest'" aria-hidden="true">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
                  </button>
                </th>
                <th :aria-sort="ariaSort('method')">
                  <button type="button" class="canva-finance-sort" @click="toggleSort('method')">
                    {{ t('owner.financeTable.method') }}
                    <span v-if="sortKey === 'method'" aria-hidden="true">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
                  </button>
                </th>
                <th :aria-sort="ariaSort('amount')">
                  <button type="button" class="canva-finance-sort" @click="toggleSort('amount')">
                    {{ t('owner.financeTable.income') }}
                    <span v-if="sortKey === 'amount'" aria-hidden="true">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tx in visibleTransactions" :key="`desk-${tx.id}`">
                <td>
                  <button type="button" class="canva-finance-table-btn font-bold text-brand-navy" @click="openTx(tx)">
                    {{ tx.reservationLabel }}
                  </button>
                </td>
                <td class="tabular-nums">
                  {{ stampDate(tx.reservedAt) }}
                  <bdi dir="ltr">{{ stampTime(tx.reservedAt) }}</bdi>
                </td>
                <td class="tabular-nums">
                  <template v-if="tx.paidAt">
                    {{ stampDate(tx.paidAt) }}
                    <bdi dir="ltr">{{ stampTime(tx.paidAt) }}</bdi>
                  </template>
                  <template v-else>—</template>
                </td>
                <td>{{ tx.guestName }}</td>
                <td>
                  <span v-if="tx.kind === 'slot'" class="canva-finance-method-badge">
                    {{ bookingStatusLabel(tx.bookingStatus) }}
                  </span>
                  <span v-else class="canva-finance-method-badge" :class="methodBadgeClass(tx.paymentMethod)">
                    {{ methodBadgeLabel(tx.paymentMethod) }}
                  </span>
                </td>
                <td class="tabular-nums font-bold">{{ formatCurrency(tx.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="border border-dashed border-brand-gray-200 px-3 py-8 text-center text-sm text-brand-gray-500" style="border-radius: var(--sz-canva-radius);">{{ t('common.empty') }}</p>
      </div>

      <div v-if="showPayoutsSection" class="canva-panel space-y-3">
        <h2 class="text-base font-bold text-brand-navy">{{ t('owner.financePage.payoutsTitle') }}</h2>
        <p class="text-sm text-brand-gray-600">
          {{ t('owner.financePage.commissionNote', { pct: formatNumber(commissionPct) }) }}
        </p>
        <p class="text-xs font-bold text-red-600 text-start" role="note">
          {{ t('owner.financePage.payoutOwnerOnlyNotice') }}
        </p>
        <div class="flex items-center justify-between gap-3 border border-brand-gray-200 bg-brand-cream px-3 py-3" style="border-radius: var(--sz-canva-radius);">
          <span class="text-sm text-brand-gray-600">{{ t('owner.financePage.walletBalance') }}</span>
          <span class="text-base font-bold tabular-nums text-brand-navy" dir="ltr">{{ formatCurrency(settlement?.withdrawableBalance ?? settlement?.balance ?? 0) }}</span>
        </div>
        <p
          v-if="Number(settlement?.pendingClassBalance || 0) > 0"
          class="text-xs text-brand-gray-600 text-start"
        >
          {{ t('owner.financePage.pendingClassBalance', { amount: formatCurrency(settlement?.pendingClassBalance || 0) }) }}
        </p>
        <p class="text-xs text-brand-gray-500 text-start">
          {{ t('owner.financePage.cashoutAfterClassNote') }}
        </p>

        <label class="block text-sm text-start">
          <span class="mb-1 block font-bold text-brand-navy">{{ t('owner.financePage.shebaLabel') }}</span>
          <input
            v-model="shebaInput"
            dir="ltr"
            class="neo-input tabular-nums"
            :placeholder="t('owner.financePage.shebaPlaceholder')"
            autocomplete="off"
          >
        </label>
        <button
          type="button"
          class="canva-gate-btn-secondary w-full"
          :disabled="payoutBusy"
          @click="saveSheba"
        >
          {{ t('owner.settingsPage.saveChanges') }}
        </button>

        <label class="block text-sm text-start">
          <span class="mb-1 block font-bold text-brand-navy">{{ t('owner.financePage.withdrawAmount') }}</span>
          <AppNumericInput
            v-model="withdrawAmount"
            :min="1"
            :disabled="!settlement?.sheba"
          />
        </label>
        <p v-if="!settlement?.sheba" class="text-xs text-brand-primary text-start">{{ t('owner.financePage.shebaRequired') }}</p>
        <button
          type="button"
          class="canva-cta w-full"
          :disabled="payoutBusy || !settlement?.sheba || !withdrawAmount || Number(withdrawAmount) > Number(settlement?.withdrawableBalance ?? 0)"
          @click="submitWithdraw"
        >
          {{ t('owner.financePage.withdrawRequest') }}
        </button>

        <p v-if="payoutError" class="canva-flash-error text-start text-xs">{{ payoutError }}</p>
        <p v-else-if="payoutSuccess" class="text-start text-xs font-bold text-brand-navy">{{ payoutSuccess }}</p>

        <div v-if="settlement?.pendingWithdraws?.length" class="space-y-2 text-start">
          <p class="text-sm font-bold text-brand-navy">{{ t('owner.financePage.withdrawPending') }}</p>
          <div
            v-for="req in settlement.pendingWithdraws"
            :key="req.id"
            class="flex items-center justify-between gap-2 border border-brand-gray-200 px-3 py-2 text-xs"
            style="border-radius: var(--sz-canva-radius);"
          >
            <span class="tabular-nums" dir="ltr">{{ formatCurrency(req.amount) }}</span>
            <span class="text-brand-gray-600">{{ t('owner.financePage.withdrawPending') }}</span>
          </div>
        </div>

        <div v-if="settlement?.ledger?.length" class="space-y-2 text-start">
          <p class="text-sm font-bold text-brand-navy">{{ t('owner.financePage.ledgerTitle') }}</p>
          <div
            v-for="entry in settlement.ledger.slice(0, 5)"
            :key="entry.id"
            class="flex items-center justify-between gap-2 border border-brand-gray-200 px-3 py-2 text-xs"
            style="border-radius: var(--sz-canva-radius);"
          >
            <span>
              {{ t('owner.financePage.ledgerNet') }}
              <template v-if="entry.clawedBackAt"> · {{ t('owner.financePage.ledgerClawed') }}</template>
            </span>
            <span class="tabular-nums font-bold" dir="ltr">{{ formatCurrency(entry.ownerNet) }}</span>
          </div>
        </div>
        </div>
      </div>
    </AppAsyncState>

    <AppModal
      :open="Boolean(selectedTx)"
      sheet
      patterned
      :title="t('owner.financeTable.detailTitle')"
      max-width-class="canva-phone-shell max-w-sm"
      @close="closeTx"
    >
      <div v-if="selectedTx" class="space-y-1 px-4 pb-5 pt-2 text-sm">
        <div class="canva-contact-row">
          <span class="text-brand-gray-500">{{ t('owner.financeTable.reservation') }}</span>
          <span class="max-w-[60%] text-start font-bold text-brand-navy">{{ selectedTx.reservationLabel || '—' }}</span>
        </div>
        <div class="canva-contact-row">
          <span class="text-brand-gray-500">{{ t('owner.financeTable.reservedAt') }}</span>
          <span class="text-start font-bold tabular-nums text-brand-navy">
            {{ stampDate(selectedTx.reservedAt) || '—' }}
            <bdi dir="ltr">{{ stampTime(selectedTx.reservedAt) }}</bdi>
          </span>
        </div>
        <div class="canva-contact-row">
          <span class="text-brand-gray-500">{{ t('owner.financeTable.paidAt') }}</span>
          <span class="text-start font-bold tabular-nums text-brand-navy">
            <template v-if="selectedTx.paidAt">
              {{ stampDate(selectedTx.paidAt) }}
              <bdi dir="ltr">{{ stampTime(selectedTx.paidAt) }}</bdi>
            </template>
            <template v-else>—</template>
          </span>
        </div>
        <div class="canva-contact-row">
          <span class="text-brand-gray-500">{{ t('owner.financeTable.guest') }}</span>
          <span class="font-bold text-brand-navy">{{ selectedTx.guestName || '—' }}</span>
        </div>
        <div class="canva-contact-row">
          <span class="text-brand-gray-500">{{ t('owner.guestMobile') }}</span>
          <bdi dir="ltr" class="font-bold tabular-nums text-brand-navy">{{ selectedTx.guestMobile ? formatPhone(selectedTx.guestMobile) : '—' }}</bdi>
        </div>
        <div class="canva-contact-row">
          <span class="text-brand-gray-500">{{ t('owner.financeTable.method') }}</span>
          <span class="font-bold text-brand-navy">{{ selectedTx.kind === 'slot' ? '—' : t(`owner.paymentMethods.${selectedTx.paymentMethod || 'NOT_PAID'}`) }}</span>
        </div>
        <div class="canva-contact-row">
          <span class="text-brand-gray-500">{{ t('owner.financeTable.status') }}</span>
          <span class="font-bold text-brand-navy">{{ bookingStatusLabel(String(selectedTx.bookingStatus || '')) }}</span>
        </div>
        <div v-if="selectedTx.discountCode" class="canva-contact-row">
          <span class="text-brand-gray-500">{{ t('owner.financeTable.discountCode') }}</span>
          <bdi dir="ltr" class="font-bold tabular-nums text-brand-navy">{{ selectedTx.discountCode }}</bdi>
        </div>
        <div v-else-if="selectedTx.complimentary" class="canva-contact-row">
          <span class="text-brand-gray-500">{{ t('owner.financeTable.discountCode') }}</span>
          <span class="font-bold text-brand-navy">{{ t('owner.financeTable.complimentary') }}</span>
        </div>
        <div v-if="selectedTx.discountPercent" class="canva-contact-row">
          <span class="text-brand-gray-500">{{ t('owner.financeTable.discountPercent') }}</span>
          <bdi dir="ltr" class="font-bold tabular-nums text-brand-navy">{{ formatNumber(selectedTx.discountPercent) }}٪</bdi>
        </div>
        <div v-if="selectedTx.discountAmount" class="canva-contact-row">
          <span class="text-brand-gray-500">{{ t('owner.financeTable.discountAmount') }}</span>
          <span class="font-bold text-brand-primary" dir="ltr">−{{ formatCurrency(selectedTx.discountAmount) }}</span>
        </div>
        <div v-if="selectedTx.subtotalBeforeDiscount" class="canva-contact-row">
          <span class="text-brand-gray-500">{{ t('owner.financeTable.priceBeforeDiscount') }}</span>
          <span class="font-bold tabular-nums text-brand-navy">{{ formatCurrency(selectedTx.subtotalBeforeDiscount) }}</span>
        </div>
        <div class="canva-contact-row border-b-0">
          <span class="text-brand-gray-500">{{ t('owner.financeTable.income') }}</span>
          <span class="font-bold text-brand-primary">{{ formatCurrency(Number(selectedTx.amount || 0)) }}</span>
        </div>
        <button type="button" class="canva-black-cta mt-3" @click="closeTx">{{ t('common.close') }}</button>
      </div>
    </AppModal>

    <OwnerLegalFooter />
    </div>
  </div>
</template>
