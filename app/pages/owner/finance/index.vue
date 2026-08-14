<script setup lang="ts">
import { hasOwnerPermission, parsePermissions } from '#shared/ownerPermissions.ts'
import { isUnpaidPaymentStatus } from '#shared/bookingPayment.ts'

/** Canva finance — black income hero + method bar + txn sheet. */
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { user, fetch: fetchAuth } = useAuth()
const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })
const { data, pending, error, refresh } = await useAuthedFetch('/api/owner/finance')
const { data: settlement, refresh: refreshSettlement } = await useAuthedFetch('/api/owner/settlement', {
  immediate: false,
  watch: false,
})
const { formatCurrency, formatNumber, formatDate, formatWeekday, formatDayNumber, formatMonth } = useFormatters()
const { today } = useLocalDate()
const { pilotNoCoach } = usePilotFlags()
const { fetchErrorMessage } = useFetchError()

onMounted(() => { fetchAuth() })

const period = ref<'day' | 'week' | 'month'>('day')
const selectedTx = ref<Record<string, unknown> | null>(null)
const shebaInput = ref('')
const withdrawAmount = ref('')
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
    await $fetch('/api/owner/withdraw', {
      method: 'POST',
      body: { amount: Number(withdrawAmount.value) },
    })
    payoutSuccess.value = t('owner.financePage.withdrawSuccess')
    withdrawAmount.value = ''
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
  return t(`booking.status.${status}`)
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

/** Canva day chips: رزروها / در انتظار تسویه / عدم حضور — real stats only. */
const summaryChips = computed(() => {
  const unpaidAmt = data.value?.stats?.unpaidAmount
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

const visibleTransactions = computed(() => {
  const list = data.value?.transactions || []
  if (!pilotNoCoach.value) return list
  return list.filter((tx: { kind?: string }) => tx.kind !== 'coach')
})

function openTx(tx: Record<string, unknown>) {
  selectedTx.value = tx
}

function closeTx() {
  selectedTx.value = null
}
</script>

<template>
  <div class="venus-page-stack">
    <section class="canva-photo-hero -mx-4 sm:-mx-0">
      <img
        src="/hero/fitness-venue.jpg"
        alt=""
        class="canva-photo-hero-media"
        style="filter: grayscale(0.55) brightness(0.72);"
      />
      <div class="canva-photo-hero-wash" />
      <div class="canva-photo-hero-top">
        <InboxWordmark home-link class="text-base text-white" />
        <div class="flex items-center gap-3 text-white">
          <NuxtLink :to="localePath('/owner/settings')" :aria-label="t('owner.settings')">
            <AppIcon name="notifications" size="sm" />
          </NuxtLink>
          <NuxtLink :to="localePath('/owner/settings')" :aria-label="t('nav.profile')">
            <AppIcon name="person" size="sm" />
          </NuxtLink>
        </div>
      </div>
      <div class="canva-promo-badge pointer-events-none" aria-hidden="true">
        <span class="canva-promo-badge-pct">۲۰٪</span>
        <span class="canva-promo-badge-label">{{ t('owner.calendarPromoShort') }}</span>
      </div>
      <div class="canva-photo-hero-body !min-h-[9.5rem] !pb-8" />
    </section>

    <div class="canva-cal-sheet -mx-4 sm:mx-0">
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
      <p class="mt-2 text-3xl font-bold tabular-nums text-brand-primary">{{ formatCurrency(heroAmount) }}</p>
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
      <div v-if="showReports" class="canva-finance-chips">
        <div v-for="chip in summaryChips" :key="chip.key" class="canva-finance-chip">
          <p class="canva-finance-chip-label">{{ chip.label }}</p>
          <p class="canva-finance-chip-value">{{ chip.value }}</p>
        </div>
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

      <div v-if="showTransactions" class="space-y-3">
        <h2 class="text-start text-base font-bold text-brand-navy">{{ t('owner.financePage.recentTransactions') }}</h2>
        <div v-if="visibleTransactions.length" class="space-y-2">
          <button
            v-for="tx in visibleTransactions"
            :key="tx.id"
            type="button"
            class="canva-finance-tx-card"
            @click="openTx(tx)"
          >
            <div class="min-w-0 flex-1 text-start">
              <p class="text-sm font-bold text-brand-navy">{{ tx.reservationLabel }}</p>
              <p class="mt-0.5 text-xs text-brand-gray-600">{{ tx.guestName }}</p>
            </div>
            <div class="shrink-0 text-start">
              <p class="text-sm font-bold text-brand-navy">{{ formatCurrency(tx.amount) }}</p>
              <span class="canva-finance-method-badge mt-1" :class="methodBadgeClass(tx.paymentMethod)">
                {{ methodBadgeLabel(tx.paymentMethod) }}
              </span>
            </div>
          </button>
        </div>
        <p v-else class="border border-dashed border-brand-gray-200 px-3 py-8 text-center text-sm text-brand-gray-500" style="border-radius: var(--sz-canva-radius);">{{ t('common.empty') }}</p>
      </div>

      <div v-if="showPayoutsSection" class="canva-panel space-y-3">
        <h2 class="text-base font-bold text-brand-navy">{{ t('owner.financePage.payoutsTitle') }}</h2>
        <p class="text-sm text-brand-gray-600">
          {{ t('owner.financePage.commissionNote', { pct: formatNumber(commissionPct) }) }}
        </p>
        <div class="flex items-center justify-between gap-3 border border-brand-gray-200 bg-brand-cream px-3 py-3" style="border-radius: var(--sz-canva-radius);">
          <span class="text-sm text-brand-gray-600">{{ t('owner.financePage.walletBalance') }}</span>
          <span class="text-base font-bold tabular-nums text-brand-navy" dir="ltr">{{ formatCurrency(settlement?.balance || 0) }}</span>
        </div>

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
          <input
            v-model="withdrawAmount"
            type="number"
            min="1"
            dir="ltr"
            class="neo-input tabular-nums"
            :disabled="!settlement?.sheba"
          >
        </label>
        <p v-if="!settlement?.sheba" class="text-xs text-brand-primary text-start">{{ t('owner.financePage.shebaRequired') }}</p>
        <button
          type="button"
          class="canva-cta w-full"
          :disabled="payoutBusy || !settlement?.sheba || !withdrawAmount"
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
          <span class="text-brand-gray-500">{{ t('owner.financeTable.guest') }}</span>
          <span class="font-bold text-brand-navy">{{ selectedTx.guestName || '—' }}</span>
        </div>
        <div class="canva-contact-row">
          <span class="text-brand-gray-500">{{ t('owner.guestMobile') }}</span>
          <bdi dir="ltr" class="font-bold tabular-nums text-brand-navy">{{ selectedTx.guestMobile || '—' }}</bdi>
        </div>
        <div class="canva-contact-row">
          <span class="text-brand-gray-500">{{ t('owner.financeTable.method') }}</span>
          <span class="font-bold text-brand-navy">{{ t(`owner.paymentMethods.${selectedTx.paymentMethod || 'NOT_PAID'}`) }}</span>
        </div>
        <div class="canva-contact-row">
          <span class="text-brand-gray-500">{{ t('owner.financeTable.status') }}</span>
          <span class="font-bold text-brand-navy">{{ bookingStatusLabel(String(selectedTx.bookingStatus || '')) }}</span>
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
