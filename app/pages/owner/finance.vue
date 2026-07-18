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
  <div class="tail-page-stack">
    <div>
      <h1 class="tail-page-title">{{ $t('owner.finance') }}</h1>
      <p class="mt-1 text-sm font-bold text-brand-gray-600">{{ t('owner.financePage.subtitle') }}</p>
    </div>
    <AppAsyncState :pending="pending" :error="error" skeleton-variant="stat-grid">
      <div v-if="canReports" class="tail-card-grid-4">
        <AppTailStatCard
          v-for="(val, key) in data?.stats"
          :key="key"
          :label="t(`owner.financeCards.${String(key)}`)"
          :value="formatStatValue(String(key), val)"
          icon="payments"
        />
      </div>

      <div v-if="canReports" class="tail-card-grid-3">
        <div class="tail-card lg:col-span-2">
          <h2 class="tail-section-title mb-4">{{ t('owner.financePage.weeklyChart') }}</h2>
          <div v-if="isChartEmpty" class="tail-chart-empty">
            {{ t('owner.financePage.chartEmpty') }}
          </div>
          <div v-else class="rounded-lg border border-brand-gray-200 bg-brand-gray-50 px-3 pb-2 pt-4">
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
                  class="tail-chart-bar w-full max-w-[2.5rem]"
                  :style="{ height: `${barHeightPx(amount)}px` }"
                  :title="`${formatWeekLabel(data?.weekLabels?.[index])} — ${formatCurrency(amount)}`"
                />
                <span class="text-[10px] font-medium text-brand-gray-500" dir="auto">{{ formatWeekLabel(data?.weekLabels?.[index]) }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="tail-card">
          <h2 class="tail-section-title mb-4">{{ t('owner.financePage.paymentBreakdown') }}</h2>
          <p class="mb-3 text-xs font-medium text-brand-gray-500">{{ t('owner.financePage.paymentBreakdownHint') }}</p>
          <div class="space-y-3 text-sm">
            <div class="flex items-center justify-between">
              <span class="text-brand-gray-600">{{ t('owner.financePage.breakdown.PAID_CASH') }}</span>
              <span class="font-semibold text-brand-navy">{{ data?.paymentBreakdown?.PAID_CASH ?? data?.paymentBreakdown?.CASH ?? 0 }}%</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-brand-gray-600">{{ t('owner.financePage.breakdown.PAID_IPG') }}</span>
              <span class="font-semibold text-brand-navy">{{ data?.paymentBreakdown?.PAID_IPG ?? data?.paymentBreakdown?.IPG ?? 0 }}%</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-brand-gray-600">{{ t('owner.financePage.breakdown.UNPAID') }}</span>
              <span class="font-semibold text-amber-700">{{ data?.paymentBreakdown?.UNPAID ?? data?.paymentBreakdown?.NOT_PAID ?? 0 }}%</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="canReports" class="tail-card-grid-3">
        <div class="tail-card lg:col-span-2">
          <h2 class="tail-section-title mb-4">{{ t('owner.funnelTitle') }}</h2>
          <div class="tail-card-grid-4">
            <AppTailStatCard :label="t('owner.funnel.views')" :value="formatNumber(data?.funnel?.views || 0)" icon="visibility" />
            <AppTailStatCard :label="t('owner.funnel.initiated')" :value="formatNumber(data?.funnel?.initiated || 0)" icon="touch_app" />
            <AppTailStatCard :label="t('owner.funnel.confirmed')" :value="formatNumber(data?.funnel?.confirmed || 0)" icon="check_circle" />
            <AppTailStatCard :label="t('owner.funnel.paid')" :value="formatNumber(data?.funnel?.paid || 0)" icon="payments" />
          </div>
        </div>
        <div class="tail-card">
          <h2 class="tail-section-title mb-4">{{ t('owner.segmentsTitle') }}</h2>
          <div class="space-y-3 text-sm">
            <div class="flex items-center justify-between"><span class="text-brand-gray-600">{{ t('owner.segmentCards.activeContacts') }}</span><span class="font-semibold">{{ formatNumber(data?.segments?.activeContacts || 0) }}</span></div>
            <div class="flex items-center justify-between"><span class="text-brand-gray-600">{{ t('owner.segmentCards.churnRisk') }}</span><span class="font-semibold">{{ formatNumber(data?.segments?.churnRisk || 0) }}</span></div>
            <div class="flex items-center justify-between"><span class="text-brand-gray-600">{{ t('owner.segmentCards.waitlist') }}</span><span class="font-semibold">{{ formatNumber(data?.segments?.waitlist || 0) }}</span></div>
            <div class="flex items-center justify-between"><span class="text-brand-gray-600">{{ t('owner.segmentCards.cancellations') }}</span><span class="font-semibold">{{ formatNumber(data?.segments?.cancellations || 0) }}</span></div>
          </div>
        </div>
      </div>

      <AppTailTable v-if="canTransactions" :title="t('owner.financeTable.reservation')">
        <thead>
          <tr>
            <th>{{ t('owner.financeTable.reservation') }}</th>
            <th>{{ t('owner.financeTable.guest') }}</th>
            <th>{{ t('owner.financeTable.payment') }}</th>
            <th>{{ t('owner.financeTable.status') }}</th>
            <th>{{ t('owner.financeCards.revenue') }}</th>
          </tr>
        </thead>
        <tbody v-if="data?.transactions?.length">
          <tr v-for="tx in data?.transactions" :key="tx.id" :class="isTxUnpaid(tx) ? 'bg-amber-50/80' : ''">
            <td>
              <p class="font-semibold text-brand-navy">{{ t(`owner.financeTable.kind.${tx.kind}`) }}</p>
              <p class="text-xs text-brand-gray-500">{{ tx.reservationLabel }}</p>
              <p v-if="tx.coachName" class="text-xs text-brand-gray-500">{{ tx.coachName }}</p>
            </td>
            <td>
              <p class="font-semibold text-brand-navy">{{ tx.guestName }}</p>
              <p v-if="tx.guestMobile" class="text-xs text-brand-gray-500"><bdi dir="ltr" class="tabular-nums">{{ tx.guestMobile }}</bdi></p>
            </td>
            <td>
              <p>{{ t(`owner.paymentMethods.${tx.paymentMethod || 'NOT_PAID'}`) }}</p>
              <p class="text-xs font-semibold" :class="isTxUnpaid(tx) ? 'text-amber-700' : 'text-brand-gray-500'">
                {{ paymentStatusLabel(tx.paymentStatus) }}
              </p>
            </td>
            <td><span class="tail-badge-gray">{{ bookingStatusLabel(tx.bookingStatus) }}</span></td>
            <td class="font-semibold" :class="isTxUnpaid(tx) ? 'text-amber-700' : 'text-brand-primary'">
              {{ formatCurrency(tx.amount) }}
              <span v-if="isTxUnpaid(tx)" class="mt-0.5 block text-[10px] font-bold uppercase tracking-wide">{{ t('owner.financeTable.collectAtClub') }}</span>
            </td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr>
            <td colspan="5" class="py-8 text-center text-brand-gray-500">{{ t('common.empty') }}</td>
          </tr>
        </tbody>
      </AppTailTable>

      <div v-if="showPayouts" class="tail-card">
        <h2 class="tail-section-title mb-2">{{ t('owner.financePage.payoutsTitle') }}</h2>
        <p class="text-sm text-brand-gray-600">{{ t('owner.financePage.payoutsPlaceholder') }}</p>
      </div>
      <div v-else-if="canPayouts && payAtClubMode" class="tail-card">
        <h2 class="tail-section-title mb-2">{{ t('owner.financePage.payoutsTitle') }}</h2>
        <p class="text-sm text-brand-gray-600">{{ t('owner.financePage.payoutsPayAtClub') }}</p>
      </div>
    </AppAsyncState>
  </div>
</template>
