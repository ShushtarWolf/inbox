<script setup lang="ts">
import { hasOwnerPermission, parsePermissions } from '#shared/ownerPermissions.ts'
import { isUnpaidPaymentStatus } from '#shared/bookingPayment.ts'

/** Canva finance — black income hero + method bar + txn sheet. */
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { user } = useAuth()
const config = useRuntimeConfig()
const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })
const { data, pending, error, refresh } = await useAuthedFetch('/api/owner/finance')
useOwnerClubRefresh(refresh)
const { formatCurrency, formatNumber, formatDate } = useFormatters()

const period = ref<'day' | 'week' | 'month'>('day')
const selectedTx = ref<Record<string, unknown> | null>(null)

const activeMembership = computed(() => {
  const memberships = user.value?.memberships || []
  return memberships.find((item) => item.club.id === selectedClubId.value) || memberships[0]
})
const permissions = computed(() => parsePermissions(activeMembership.value?.permissionsJson))
const isOwner = computed(() => activeMembership.value?.role === 'OWNER')
const canReports = computed(() => isOwner.value || hasOwnerPermission(permissions.value, 'finance:reports'))
const canTransactions = computed(() => isOwner.value || hasOwnerPermission(permissions.value, 'finance:transactions'))
const canPayouts = computed(() => isOwner.value || hasOwnerPermission(permissions.value, 'finance:payouts'))
const payAtClubMode = computed(() => (config.public.paymentsMode || 'pay_at_club') === 'pay_at_club')
const showPayouts = computed(() => canPayouts.value && !payAtClubMode.value)

function formatWeekLabel(iso?: string) {
  if (!iso) return ''
  return formatDate(iso)
}

const weekly = computed(() => data.value?.weeklyRevenue || [])
const todayRevenue = computed(() => weekly.value[weekly.value.length - 1] || 0)
const yesterdayRevenue = computed(() => weekly.value[weekly.value.length - 2] || 0)
const vsYesterdayPct = computed(() => {
  const today = todayRevenue.value
  const yesterday = yesterdayRevenue.value
  if (!yesterday) return today ? 100 : 0
  return Math.round(((today - yesterday) / yesterday) * 100)
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

const heroTitle = computed(() => {
  if (period.value === 'day') return t('owner.financePage.todayRevenue')
  if (period.value === 'week') return t('owner.financePage.weekRevenue')
  return t('owner.financePage.monthRevenue')
})

const maxWeeklyRevenue = computed(() => Math.max(...weekly.value, 0))
const isChartEmpty = computed(() => !weekly.value.some((amount: number) => amount > 0))
const chartAreaHeight = 140

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

const summaryChips = computed(() => [
  { key: 'bookingsToday', label: t('owner.financeCards.bookingsToday'), value: formatNumber(data.value?.stats?.bookingsToday || 0) },
  { key: 'revenue', label: t('owner.financeCards.revenue'), value: formatCurrency(heroAmount.value) },
  { key: 'unpaid', label: t('owner.financeCards.unpaid'), value: formatNumber(data.value?.stats?.unpaid || 0) },
])

const cashPct = computed(() => Number(data.value?.paymentBreakdown?.PAID_CASH ?? data.value?.paymentBreakdown?.CASH ?? 0))
const ipgPct = computed(() => Number(data.value?.paymentBreakdown?.PAID_IPG ?? data.value?.paymentBreakdown?.IPG ?? 0))
const unpaidPct = computed(() => Number(data.value?.paymentBreakdown?.UNPAID ?? data.value?.paymentBreakdown?.NOT_PAID ?? 0))

function openTx(tx: Record<string, unknown>) {
  selectedTx.value = tx
}

function closeTx() {
  selectedTx.value = null
}
</script>

<template>
  <div class="venus-page-stack">
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
      <p v-if="period === 'day'" class="mt-1 text-xs text-white/80">{{ vsYesterdayLabel }}</p>
      <NuxtLink
        :to="localePath('/owner/finance/report')"
        class="mt-4 inline-flex w-fit items-center gap-1.5 border border-white/25 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/10"
        style="border-radius: var(--sz-canva-radius);"
      >
        {{ t('owner.financePage.advancedReport') }}
        <AppIcon name="chevron_left" size="sm" />
      </NuxtLink>
    </section>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="stat-grid">
      <div v-if="canReports" class="grid grid-cols-3 gap-2">
        <div v-for="chip in summaryChips" :key="chip.key" class="canva-panel !p-3 text-center">
          <p class="text-[10px] font-bold text-brand-gray-500">{{ chip.label }}</p>
          <p class="mt-1 text-sm font-bold text-brand-navy">{{ chip.value }}</p>
        </div>
      </div>

      <div v-if="canReports" class="canva-panel">
        <h2 class="text-sm font-bold text-brand-navy">{{ t('owner.financePage.paymentBreakdown') }}</h2>
        <div class="canva-finance-method-bar mt-3">
          <span class="h-full bg-brand-primary" :style="{ width: `${cashPct}%` }" />
          <span class="h-full bg-[#E8B84A]" :style="{ width: `${ipgPct}%` }" />
          <span class="h-full bg-brand-gray-400" :style="{ width: `${unpaidPct}%` }" />
        </div>
        <div class="mt-3 space-y-1.5 text-xs">
          <div class="flex items-center justify-between">
            <span class="text-brand-gray-600">{{ t('owner.financePage.breakdown.PAID_CASH') }}</span>
            <span class="font-bold text-brand-navy">{{ cashPct }}%</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-brand-gray-600">{{ t('owner.financePage.breakdown.PAID_IPG') }}</span>
            <span class="font-bold text-brand-navy">{{ ipgPct }}%</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-brand-gray-600">{{ t('owner.financePage.breakdown.UNPAID') }}</span>
            <span class="font-bold text-amber-700">{{ unpaidPct }}%</span>
          </div>
        </div>
      </div>

      <div v-if="canReports" class="canva-panel">
        <h2 class="text-sm font-bold text-brand-navy">{{ t('owner.financePage.weeklyChart') }}</h2>
        <div v-if="isChartEmpty" class="mt-4 border border-dashed border-brand-gray-200 bg-brand-cream px-3 py-8 text-center text-sm text-brand-gray-500" style="border-radius: var(--sz-canva-radius);">
          {{ t('owner.financePage.chartEmpty') }}
        </div>
        <div v-else class="mt-4 border border-brand-gray-200 bg-brand-cream px-3 pb-2 pt-4" style="border-radius: var(--sz-canva-radius);">
          <div class="flex items-end justify-between gap-2" :style="{ height: `${chartAreaHeight}px` }">
            <div
              v-for="(amount, index) in weekly"
              :key="data?.weekLabels?.[index] || index"
              class="group flex h-full flex-1 flex-col items-center justify-end gap-1"
            >
              <span class="text-[10px] font-medium text-brand-navy tabular-nums" dir="ltr">
                <bdi>{{ formatCurrency(amount) }}</bdi>
              </span>
              <div
                class="w-full max-w-[2.5rem] bg-brand-primary"
                style="border-radius: var(--sz-canva-radius) var(--sz-canva-radius) 0 0;"
                :style="{ height: `${barHeightPx(amount)}px` }"
                :title="`${formatWeekLabel(data?.weekLabels?.[index])} — ${formatCurrency(amount)}`"
              />
              <span class="text-[10px] font-medium text-brand-gray-500" dir="auto">{{ formatWeekLabel(data?.weekLabels?.[index]) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="canTransactions" class="canva-panel space-y-3">
        <h2 class="text-base font-bold text-brand-navy">{{ t('owner.financeTable.reservation') }}</h2>
        <div v-if="data?.transactions?.length" class="space-y-2">
          <button
            v-for="tx in data?.transactions"
            :key="tx.id"
            type="button"
            class="canva-list-card w-full text-start"
            :class="isTxUnpaid(tx) ? 'border-amber-200 bg-amber-50/60' : ''"
            @click="openTx(tx)"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="font-bold text-brand-navy">{{ t(`owner.financeTable.kind.${tx.kind}`) }} · {{ tx.reservationLabel }}</p>
                <p class="mt-0.5 text-sm text-brand-gray-600">{{ tx.guestName }} <bdi v-if="tx.guestMobile" dir="ltr" class="tabular-nums">· {{ tx.guestMobile }}</bdi></p>
              </div>
              <div class="text-start">
                <p class="font-bold" :class="isTxUnpaid(tx) ? 'text-amber-700' : 'text-brand-primary'">{{ formatCurrency(tx.amount) }}</p>
              </div>
            </div>
          </button>
        </div>
        <p v-else class="border border-dashed border-brand-gray-200 px-3 py-8 text-center text-sm text-brand-gray-500" style="border-radius: var(--sz-canva-radius);">{{ t('common.empty') }}</p>
      </div>

      <div v-if="showPayouts" class="canva-panel">
        <h2 class="text-base font-bold text-brand-navy">{{ t('owner.financePage.payoutsTitle') }}</h2>
        <p class="mt-2 text-sm text-brand-gray-600">{{ t('owner.financePage.payoutsPlaceholder') }}</p>
      </div>
      <div v-else-if="canPayouts && payAtClubMode" class="canva-panel">
        <h2 class="text-base font-bold text-brand-navy">{{ t('owner.financePage.payoutsTitle') }}</h2>
        <p class="mt-2 text-sm text-brand-gray-600">{{ t('owner.financePage.payoutsPayAtClub') }}</p>
      </div>
    </AppAsyncState>

    <AppModal :open="Boolean(selectedTx)" sheet patterned :title="t('owner.financeTable.reservation')" max-width-class="canva-phone-shell" @close="closeTx">
      <div v-if="selectedTx" class="space-y-3 px-4 pb-5 pt-2 text-sm">
        <div class="canva-contact-row">
          <span class="text-brand-gray-500">{{ t('owner.guestName') }}</span>
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
          <span class="font-bold text-brand-navy">{{ paymentStatusLabel(String(selectedTx.paymentStatus || '')) }} · {{ bookingStatusLabel(String(selectedTx.bookingStatus || '')) }}</span>
        </div>
        <div class="canva-contact-row border-b-0">
          <span class="text-brand-gray-500">{{ t('common.amount') }}</span>
          <span class="font-bold text-brand-primary">{{ formatCurrency(Number(selectedTx.amount || 0)) }}</span>
        </div>
        <button type="button" class="canva-gate-btn-secondary" @click="closeTx">{{ t('common.close') }}</button>
      </div>
    </AppModal>

    <OwnerLegalFooter />
  </div>
</template>
