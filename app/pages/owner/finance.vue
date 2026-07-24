<script setup lang="ts">
import { hasOwnerPermission, parsePermissions } from '#shared/ownerPermissions.ts'
import { isUnpaidPaymentStatus } from '#shared/bookingPayment.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' , ssr: false})

const { t } = useI18n()
const { user } = useAuth()
const config = useRuntimeConfig()
const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })
const { data, pending, error, refresh } = await useAuthedFetch('/api/owner/finance')
useOwnerClubRefresh(refresh)
const { formatCurrency, formatNumber, formatDate } = useFormatters()

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

const maxWeeklyRevenue = computed(() => Math.max(...(data.value?.weeklyRevenue || [0]), 0))
const isChartEmpty = computed(() => !(data.value?.weeklyRevenue || []).some((amount) => amount > 0))
const chartAreaHeight = 140

function barHeightPx(amount: number) {
  if (!amount || !maxWeeklyRevenue.value) return 0
  return Math.max(12, Math.round((amount / maxWeeklyRevenue.value) * chartAreaHeight))
}

function formatStatValue(key: string, val: unknown) {
  if (key === 'revenue' || key === 'ltv' || key === 'unpaidAmount') return formatCurrency(Number(val))
  const suffix = ['paidRate', 'utilization', 'noShowRate'].includes(key) ? '%' : ''
  return `${formatNumber(val)}${suffix}`
}

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
</script>

<template>
  <div class="venus-page-stack">
    <section class="canva-dash-hero">
      <p class="text-xs text-white/80">{{ t('owner.dashboardEyebrow') }}</p>
      <h1 class="canva-page-hero-title">{{ $t('owner.finance') }}</h1>
      <p class="mt-1 text-sm text-white/85">{{ t('owner.financePage.subtitle') }}</p>
    </section>
    <AppAsyncState :pending="pending" :error="error" skeleton-variant="stat-grid">
      <div v-if="canReports" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div
          v-for="(val, key) in data?.stats"
          :key="key"
          class="canva-panel"
        >
          <p class="text-xs font-bold text-brand-gray-500">{{ t(`owner.financeCards.${String(key)}`) }}</p>
          <p class="mt-1 text-xl font-bold text-brand-navy">{{ formatStatValue(String(key), val) }}</p>
        </div>
      </div>

      <div v-if="canReports" class="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <div class="canva-panel">
          <h2 class="text-base font-bold text-brand-navy">{{ t('owner.financePage.weeklyChart') }}</h2>
          <div v-if="isChartEmpty" class="mt-4 rounded-xl border border-dashed border-brand-gray-200 bg-brand-cream px-3 py-8 text-center text-sm text-brand-gray-500">
            {{ t('owner.financePage.chartEmpty') }}
          </div>
          <div v-else class="mt-4 rounded-xl border border-brand-gray-200 bg-brand-cream px-3 pb-2 pt-4">
            <div class="mb-2 flex items-center justify-between text-[10px] font-medium text-brand-gray-500">
              <span>{{ formatCurrency(maxWeeklyRevenue) }}</span>
              <span>{{ formatCurrency(0) }}</span>
            </div>
            <div class="flex items-end justify-between gap-2" :style="{ height: `${chartAreaHeight}px` }">
              <div
                v-for="(amount, index) in data?.weeklyRevenue || []"
                :key="data?.weekLabels?.[index] || index"
                class="group flex h-full flex-1 flex-col items-center justify-end gap-1"
              >
                <span class="text-[10px] font-medium text-brand-navy tabular-nums" dir="ltr">
                  <bdi>{{ formatCurrency(amount) }}</bdi>
                </span>
                <div
                  class="w-full max-w-[2.5rem] rounded-t-md bg-brand-primary"
                  :style="{ height: `${barHeightPx(amount)}px` }"
                  :title="`${formatWeekLabel(data?.weekLabels?.[index])} — ${formatCurrency(amount)}`"
                />
                <span class="text-[10px] font-medium text-brand-gray-500" dir="auto">{{ formatWeekLabel(data?.weekLabels?.[index]) }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="canva-panel">
          <h2 class="text-base font-bold text-brand-navy">{{ t('owner.financePage.paymentBreakdown') }}</h2>
          <p class="mb-3 mt-1 text-xs text-brand-gray-500">{{ t('owner.financePage.paymentBreakdownHint') }}</p>
          <div class="space-y-3 text-sm">
            <div class="flex items-center justify-between">
              <span class="text-brand-gray-600">{{ t('owner.financePage.breakdown.PAID_CASH') }}</span>
              <span class="font-bold text-brand-navy">{{ data?.paymentBreakdown?.PAID_CASH ?? data?.paymentBreakdown?.CASH ?? 0 }}%</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-brand-gray-600">{{ t('owner.financePage.breakdown.PAID_IPG') }}</span>
              <span class="font-bold text-brand-navy">{{ data?.paymentBreakdown?.PAID_IPG ?? data?.paymentBreakdown?.IPG ?? 0 }}%</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-brand-gray-600">{{ t('owner.financePage.breakdown.UNPAID') }}</span>
              <span class="font-bold text-amber-700">{{ data?.paymentBreakdown?.UNPAID ?? data?.paymentBreakdown?.NOT_PAID ?? 0 }}%</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="canReports" class="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <div class="canva-panel">
          <h2 class="mb-3 text-base font-bold text-brand-navy">{{ t('owner.funnelTitle') }}</h2>
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-xl border border-brand-gray-200 bg-brand-cream p-3">
              <p class="text-xs text-brand-gray-500">{{ t('owner.funnel.views') }}</p>
              <p class="mt-1 font-bold text-brand-navy">{{ formatNumber(data?.funnel?.views || 0) }}</p>
            </div>
            <div class="rounded-xl border border-brand-gray-200 bg-brand-cream p-3">
              <p class="text-xs text-brand-gray-500">{{ t('owner.funnel.initiated') }}</p>
              <p class="mt-1 font-bold text-brand-navy">{{ formatNumber(data?.funnel?.initiated || 0) }}</p>
            </div>
            <div class="rounded-xl border border-brand-gray-200 bg-brand-cream p-3">
              <p class="text-xs text-brand-gray-500">{{ t('owner.funnel.confirmed') }}</p>
              <p class="mt-1 font-bold text-brand-navy">{{ formatNumber(data?.funnel?.confirmed || 0) }}</p>
            </div>
            <div class="rounded-xl border border-brand-gray-200 bg-brand-cream p-3">
              <p class="text-xs text-brand-gray-500">{{ t('owner.funnel.paid') }}</p>
              <p class="mt-1 font-bold text-brand-navy">{{ formatNumber(data?.funnel?.paid || 0) }}</p>
            </div>
          </div>
        </div>
        <div class="canva-panel">
          <h2 class="mb-3 text-base font-bold text-brand-navy">{{ t('owner.segmentsTitle') }}</h2>
          <div class="space-y-3 text-sm">
            <div class="flex items-center justify-between"><span class="text-brand-gray-600">{{ t('owner.segmentCards.activeContacts') }}</span><span class="font-bold">{{ formatNumber(data?.segments?.activeContacts || 0) }}</span></div>
            <div class="flex items-center justify-between"><span class="text-brand-gray-600">{{ t('owner.segmentCards.churnRisk') }}</span><span class="font-bold">{{ formatNumber(data?.segments?.churnRisk || 0) }}</span></div>
            <div class="flex items-center justify-between"><span class="text-brand-gray-600">{{ t('owner.segmentCards.waitlist') }}</span><span class="font-bold">{{ formatNumber(data?.segments?.waitlist || 0) }}</span></div>
            <div class="flex items-center justify-between"><span class="text-brand-gray-600">{{ t('owner.segmentCards.cancellations') }}</span><span class="font-bold">{{ formatNumber(data?.segments?.cancellations || 0) }}</span></div>
          </div>
        </div>
      </div>

      <div v-if="canTransactions" class="canva-panel space-y-3">
        <h2 class="text-base font-bold text-brand-navy">{{ t('owner.financeTable.reservation') }}</h2>
        <div v-if="data?.transactions?.length" class="space-y-2">
          <div
            v-for="tx in data?.transactions"
            :key="tx.id"
            class="canva-list-card"
            :class="isTxUnpaid(tx) ? 'border-amber-200 bg-amber-50/60' : ''"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="font-bold text-brand-navy">{{ t(`owner.financeTable.kind.${tx.kind}`) }} · {{ tx.reservationLabel }}</p>
                <p class="mt-0.5 text-sm text-brand-gray-600">{{ tx.guestName }} <bdi v-if="tx.guestMobile" dir="ltr" class="tabular-nums">· {{ tx.guestMobile }}</bdi></p>
                <p class="mt-1 text-xs text-brand-gray-500">
                  {{ t(`owner.paymentMethods.${tx.paymentMethod || 'NOT_PAID'}`) }} · {{ paymentStatusLabel(tx.paymentStatus) }} · {{ bookingStatusLabel(tx.bookingStatus) }}
                </p>
              </div>
              <div class="text-end">
                <p class="font-bold" :class="isTxUnpaid(tx) ? 'text-amber-700' : 'text-brand-primary'">{{ formatCurrency(tx.amount) }}</p>
                <p v-if="isTxUnpaid(tx)" class="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">{{ t('owner.financeTable.collectAtClub') }}</p>
              </div>
            </div>
          </div>
        </div>
        <p v-else class="rounded-xl border border-dashed border-brand-gray-200 px-3 py-8 text-center text-sm text-brand-gray-500">{{ t('common.empty') }}</p>
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
  </div>
</template>
