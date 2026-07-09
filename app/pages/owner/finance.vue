<script setup lang="ts">
definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' , ssr: false})

const { t } = useI18n()
const { data, refresh } = await useAuthedFetch('/api/owner/finance')
useOwnerClubRefresh(refresh)
const { formatCurrency } = useFormatters()

const maxWeeklyRevenue = computed(() => Math.max(...(data.value?.weeklyRevenue || [1]), 1))

function statLabel(key: string) {
  return t(`owner.financeCards.${key}`)
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
    <div class="grid gap-3 md:grid-cols-4">
      <div v-for="(val, key) in data?.stats" :key="key" class="rounded-xl border bg-white p-3 text-center">
        <p class="text-lg font-black text-brand-primary">
          {{ key === 'revenue' || key === 'ltv' ? formatCurrency(Number(val)) : `${val}${['paidRate', 'utilization', 'noShowRate'].includes(String(key)) ? '%' : ''}` }}
        </p>
        <p class="text-xs text-brand-gray-600">{{ statLabel(String(key)) }}</p>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <div class="rounded-xl border bg-white p-4 lg:col-span-2">
        <h2 class="mb-3 font-bold">{{ t('owner.financePage.weeklyChart') }}</h2>
        <div class="flex h-44 items-end justify-between gap-2 rounded-xl bg-gradient-to-t from-brand-cream/80 to-white px-3 pb-2 pt-4">
          <div
            v-for="(amount, index) in data?.weeklyRevenue || []"
            :key="data?.weekLabels?.[index] || index"
            class="flex flex-1 flex-col items-center gap-2"
          >
            <div
              class="w-full max-w-[2.5rem] rounded-t-md bg-gradient-to-t from-brand-primary to-brand-primary/60 shadow-sm transition-all"
              :style="{ height: `${Math.max(16, (amount / maxWeeklyRevenue) * 100)}%` }"
            />
            <span class="text-[10px] font-semibold text-brand-gray-600">{{ data?.weekLabels?.[index]?.slice(5) }}</span>
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
            <p class="text-lg font-black text-brand-primary">{{ data?.funnel?.views || 0 }}</p>
            <p class="text-xs text-brand-gray-600">{{ t('owner.funnel.views') }}</p>
          </div>
          <div class="rounded-xl bg-brand-cream p-3 text-center">
            <p class="text-lg font-black text-brand-primary">{{ data?.funnel?.initiated || 0 }}</p>
            <p class="text-xs text-brand-gray-600">{{ t('owner.funnel.initiated') }}</p>
          </div>
          <div class="rounded-xl bg-brand-cream p-3 text-center">
            <p class="text-lg font-black text-brand-primary">{{ data?.funnel?.confirmed || 0 }}</p>
            <p class="text-xs text-brand-gray-600">{{ t('owner.funnel.confirmed') }}</p>
          </div>
          <div class="rounded-xl bg-brand-cream p-3 text-center">
            <p class="text-lg font-black text-brand-primary">{{ data?.funnel?.paid || 0 }}</p>
            <p class="text-xs text-brand-gray-600">{{ t('owner.funnel.paid') }}</p>
          </div>
        </div>
      </div>
      <div class="rounded-xl border bg-white p-4">
        <h2 class="mb-3 font-bold">{{ t('owner.segmentsTitle') }}</h2>
        <div class="space-y-2 text-sm">
          <div class="flex items-center justify-between"><span>{{ t('owner.segmentCards.activeContacts') }}</span><span class="font-bold">{{ data?.segments?.activeContacts || 0 }}</span></div>
          <div class="flex items-center justify-between"><span>{{ t('owner.segmentCards.churnRisk') }}</span><span class="font-bold">{{ data?.segments?.churnRisk || 0 }}</span></div>
          <div class="flex items-center justify-between"><span>{{ t('owner.segmentCards.waitlist') }}</span><span class="font-bold">{{ data?.segments?.waitlist || 0 }}</span></div>
          <div class="flex items-center justify-between"><span>{{ t('owner.segmentCards.cancellations') }}</span><span class="font-bold">{{ data?.segments?.cancellations || 0 }}</span></div>
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
        <tbody>
          <tr v-for="tx in data?.transactions" :key="tx.id" class="border-t">
            <td class="p-2">
              <p class="font-bold">{{ t(`owner.financeTable.kind.${tx.kind}`) }}</p>
              <p class="text-xs text-brand-gray-600">{{ tx.reservationLabel }}</p>
              <p v-if="tx.coachName" class="text-xs text-brand-gray-600">{{ tx.coachName }}</p>
            </td>
            <td class="p-2">
              <p class="font-bold">{{ tx.guestName }}</p>
              <p v-if="tx.guestMobile" class="text-xs text-brand-gray-600">{{ tx.guestMobile }}</p>
              <p class="text-xs text-brand-gray-600">{{ tx.id }}</p>
            </td>
            <td class="p-2">
              <p>{{ t(`owner.paymentMethods.${tx.paymentMethod || 'NOT_PAID'}`) }}</p>
              <p class="text-xs text-brand-gray-600">{{ paymentStatusLabel(tx.paymentStatus) }}</p>
            </td>
            <td class="p-2">{{ bookingStatusLabel(tx.bookingStatus) }}</td>
            <td class="p-2">{{ formatCurrency(tx.amount) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
