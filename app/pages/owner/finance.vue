<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' , ssr: false})

const { t } = useI18n()
const { data, pending, error, refresh } = await useAuthedFetch('/api/owner/finance')
useOwnerClubRefresh(refresh)
const { formatCurrency, formatNumber, formatDate } = useFormatters()

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

function statLabel(key: string) {
  return t(`owner.financeCards.${key}`)
}

function formatStatValue(key: string, val: unknown) {
  if (key === 'revenue' || key === 'ltv') return formatCurrency(Number(val))
  const suffix = ['paidRate', 'utilization', 'noShowRate'].includes(key) ? '%' : ''
  return `${formatNumber(val)}${suffix}`
}

function bookingStatusLabel(status: string) {
  return t(`booking.status.${status}`)
}

function paymentStatusLabel(status: string) {
  return t(`booking.paymentStatus.${status}`)
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="font-display text-xl font-black">{{ $t('owner.finance') }}</h1>
    <p v-if="pending" class="text-sm text-brand-gray-600">{{ t('common.loading') }}</p>
    <p v-else-if="error" class="text-sm text-red-600">{{ t('common.error') }}</p>
    <template v-else>
    <div class="grid gap-3 md:grid-cols-4">
      <div v-for="(val, key) in data?.stats" :key="key" class="rounded-xl border bg-white p-3 text-center">
        <p class="text-lg font-black text-brand-primary">
          {{ formatStatValue(String(key), val) }}
        </p>
        <p class="text-xs text-brand-gray-600">{{ statLabel(String(key)) }}</p>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <div class="rounded-xl border bg-white p-4 lg:col-span-2">
        <h2 class="mb-3 font-bold">{{ t('owner.financePage.weeklyChart') }}</h2>
        <div v-if="isChartEmpty" class="flex h-44 items-center justify-center rounded-xl bg-gradient-to-t from-brand-cream/80 to-white px-4 text-center text-sm text-brand-gray-600">
          {{ t('owner.financePage.chartEmpty') }}
        </div>
        <div v-else class="rounded-xl bg-gradient-to-t from-brand-cream/80 to-white px-3 pb-2 pt-4">
          <div class="mb-2 flex items-center justify-between text-[10px] text-brand-gray-500">
            <span>{{ formatCurrency(maxWeeklyRevenue) }}</span>
            <span>{{ formatCurrency(0) }}</span>
          </div>
          <div class="flex items-end justify-between gap-2" :style="{ height: `${chartAreaHeight}px` }">
            <div
              v-for="(amount, index) in data?.weeklyRevenue || []"
              :key="data?.weekLabels?.[index] || index"
              class="group flex h-full flex-1 flex-col items-center justify-end gap-1"
            >
              <span class="text-[10px] font-bold text-brand-primary tabular-nums" dir="ltr">
                <bdi>{{ formatCurrency(amount) }}</bdi>
              </span>
              <div
                class="w-full max-w-[2.5rem] rounded-t-md bg-gradient-to-t from-brand-primary to-brand-primary/60 shadow-sm transition-all group-hover:from-brand-primary group-hover:to-brand-primary/80"
                :style="{ height: `${barHeightPx(amount)}px` }"
                :title="`${formatWeekLabel(data?.weekLabels?.[index])} — ${formatCurrency(amount)}`"
              />
              <span class="text-[10px] font-semibold text-brand-gray-600" dir="auto">{{ formatWeekLabel(data?.weekLabels?.[index]) }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="rounded-xl border bg-white p-4">
        <h2 class="mb-3 font-bold">{{ t('owner.financePage.paymentBreakdown') }}</h2>
        <div class="space-y-2 text-sm">
          <div class="flex items-center justify-between">
            <span>{{ t('owner.paymentMethods.IPG') }}</span>
            <span class="font-bold">{{ data?.paymentBreakdown?.IPG || 0 }}%</span>
          </div>
          <div class="flex items-center justify-between">
            <span>{{ t('owner.paymentMethods.CASH') }}</span>
            <span class="font-bold">{{ data?.paymentBreakdown?.CASH || 0 }}%</span>
          </div>
          <div class="flex items-center justify-between">
            <span>{{ t('owner.paymentMethods.NOT_PAID') }}</span>
            <span class="font-bold">{{ data?.paymentBreakdown?.NOT_PAID || 0 }}%</span>
          </div>
        </div>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <div class="rounded-xl border bg-white p-4 lg:col-span-2">
        <h2 class="mb-3 font-bold">{{ t('owner.funnelTitle') }}</h2>
        <div class="grid gap-3 sm:grid-cols-4">
          <div class="rounded-xl bg-brand-cream p-3 text-center">
            <p class="text-lg font-black text-brand-primary">{{ formatNumber(data?.funnel?.views || 0) }}</p>
            <p class="text-xs text-brand-gray-600">{{ t('owner.funnel.views') }}</p>
          </div>
          <div class="rounded-xl bg-brand-cream p-3 text-center">
            <p class="text-lg font-black text-brand-primary">{{ formatNumber(data?.funnel?.initiated || 0) }}</p>
            <p class="text-xs text-brand-gray-600">{{ t('owner.funnel.initiated') }}</p>
          </div>
          <div class="rounded-xl bg-brand-cream p-3 text-center">
            <p class="text-lg font-black text-brand-primary">{{ formatNumber(data?.funnel?.confirmed || 0) }}</p>
            <p class="text-xs text-brand-gray-600">{{ t('owner.funnel.confirmed') }}</p>
          </div>
          <div class="rounded-xl bg-brand-cream p-3 text-center">
            <p class="text-lg font-black text-brand-primary">{{ formatNumber(data?.funnel?.paid || 0) }}</p>
            <p class="text-xs text-brand-gray-600">{{ t('owner.funnel.paid') }}</p>
          </div>
        </div>
      </div>
      <div class="rounded-xl border bg-white p-4">
        <h2 class="mb-3 font-bold">{{ t('owner.segmentsTitle') }}</h2>
        <div class="space-y-2 text-sm">
          <div class="flex items-center justify-between"><span>{{ t('owner.segmentCards.activeContacts') }}</span><span class="font-bold">{{ formatNumber(data?.segments?.activeContacts || 0) }}</span></div>
          <div class="flex items-center justify-between"><span>{{ t('owner.segmentCards.churnRisk') }}</span><span class="font-bold">{{ formatNumber(data?.segments?.churnRisk || 0) }}</span></div>
          <div class="flex items-center justify-between"><span>{{ t('owner.segmentCards.waitlist') }}</span><span class="font-bold">{{ formatNumber(data?.segments?.waitlist || 0) }}</span></div>
          <div class="flex items-center justify-between"><span>{{ t('owner.segmentCards.cancellations') }}</span><span class="font-bold">{{ formatNumber(data?.segments?.cancellations || 0) }}</span></div>
        </div>
      </div>
    </div>

    <div class="overflow-x-auto rounded-xl border bg-white">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-brand-cream">
            <th class="p-2">{{ t('owner.financeTable.reservation') }}</th>
            <th class="p-2">{{ t('owner.financeTable.guest') }}</th>
            <th class="p-2">{{ t('owner.financeTable.payment') }}</th>
            <th class="p-2">{{ t('owner.financeTable.status') }}</th>
            <th class="p-2">{{ t('owner.financeCards.revenue') }}</th>
          </tr>
        </thead>
        <tbody v-if="data?.transactions?.length">
          <tr v-for="tx in data?.transactions" :key="tx.id" class="border-t">
            <td class="p-2">
              <p class="font-bold">{{ t(`owner.financeTable.kind.${tx.kind}`) }}</p>
              <p class="text-xs text-brand-gray-600">{{ tx.reservationLabel }}</p>
              <p v-if="tx.coachName" class="text-xs text-brand-gray-600">{{ tx.coachName }}</p>
            </td>
            <td class="p-2">
              <p class="font-bold">{{ tx.guestName }}</p>
              <p v-if="tx.guestMobile" class="text-xs text-brand-gray-600"><bdi dir="ltr" class="tabular-nums">{{ tx.guestMobile }}</bdi></p>
              <p class="text-xs text-brand-gray-600"><bdi dir="ltr" class="tabular-nums">{{ tx.id }}</bdi></p>
            </td>
            <td class="p-2">
              <p>{{ t(`owner.paymentMethods.${tx.paymentMethod || 'NOT_PAID'}`) }}</p>
              <p class="text-xs text-brand-gray-600">{{ paymentStatusLabel(tx.paymentStatus) }}</p>
            </td>
            <td class="p-2">{{ bookingStatusLabel(tx.bookingStatus) }}</td>
            <td class="p-2">{{ formatCurrency(tx.amount) }}</td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr>
            <td colspan="5" class="p-4 text-center text-sm text-brand-gray-600">{{ t('common.empty') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    </template>
  </div>
</template>
