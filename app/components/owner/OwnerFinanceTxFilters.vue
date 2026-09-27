<script setup lang="ts">
import type { FinanceBookingKindFilter, FinanceLegendFilter, FinancePaymentFilter, FinanceSessionFilter, FinanceTxSortDir, FinanceTxSortKey } from '#shared/financeTransactions.ts'

const session = defineModel<FinanceSessionFilter>('session', { required: true })
const bookingKind = defineModel<FinanceBookingKindFilter>('bookingKind', { required: true })
const payment = defineModel<FinancePaymentFilter>('payment', { required: true })
const legend = defineModel<FinanceLegendFilter>('legend', { required: true })
const guest = defineModel<string>('guest', { required: true })
const discountCode = defineModel<string>('discountCode', { required: true })
const reservedFrom = defineModel<string>('reservedFrom', { required: true })
const reservedTo = defineModel<string>('reservedTo', { required: true })
const paidFrom = defineModel<string>('paidFrom', { required: true })
const paidTo = defineModel<string>('paidTo', { required: true })
const sortKey = defineModel<FinanceTxSortKey>('sortKey', { required: true })
const sortDir = defineModel<FinanceTxSortDir>('sortDir', { required: true })

const props = withDefaults(defineProps<{
  showSession?: boolean
  /** always: report cards. narrow: phone list, table headers sort on desktop. */
  sortMode?: 'always' | 'narrow' | 'never'
}>(), {
  showSession: true,
  sortMode: 'never',
})

const { t } = useI18n()

const sessionFilterOptions = computed(() => ([
  { value: 'all' as const, label: t('owner.financeTable.sessionFilterAll') },
  { value: 'free' as const, label: t('owner.financeTable.sessionFilterFree') },
  { value: 'coach' as const, label: t('owner.financeTable.sessionFilterCoach') },
]))

const bookingKindOptions = computed(() => ([
  { value: 'all' as const, label: t('owner.financeTable.sessionFilterAll') },
  { value: 'normal' as const, label: t('owner.financeTable.bookingKindNormal') },
  { value: 'package' as const, label: t('owner.financeTable.bookingKindPackage') },
  { value: 'coach' as const, label: t('owner.financeTable.bookingKindCoach') },
]))

const legendOptions = computed(() => ([
  { value: 'all' as const, label: t('owner.financeTable.sessionFilterAll') },
  { value: 'free' as const, label: t('owner.status.FREE') },
  { value: 'reserved' as const, label: t('owner.status.RESERVED') },
  { value: 'season' as const, label: t('owner.legendSeason') },
  { value: 'pending' as const, label: t('owner.status.PENDING') },
  { value: 'blocked' as const, label: t('owner.status.BLOCKED') },
  { value: 'paid' as const, label: t('owner.legendPaid') },
  { value: 'note' as const, label: t('owner.legendNote') },
]))

const paymentOptions = computed(() => ([
  { value: 'all' as const, label: t('owner.financeTable.sessionFilterAll') },
  { value: 'cash' as const, label: t('owner.financeTable.paymentCash') },
  { value: 'ipg' as const, label: t('owner.financeTable.paymentIpg') },
  { value: 'unpaid' as const, label: t('owner.financeTable.paymentUnpaid') },
]))

const sortOptions: FinanceTxSortKey[] = ['reservation', 'reservedAt', 'paidAt', 'guest', 'method', 'amount']

const hasDateFilter = computed(() => Boolean(reservedFrom.value || reservedTo.value || paidFrom.value || paidTo.value))

function clearDates() {
  reservedFrom.value = ''
  reservedTo.value = ''
  paidFrom.value = ''
  paidTo.value = ''
}

const visibleKindOptions = computed(() => (
  props.showSession ? bookingKindOptions.value : bookingKindOptions.value.filter((opt) => opt.value !== 'coach')
))

function sortLabel(key: FinanceTxSortKey) {
  if (key === 'reservation') return t('owner.financeTable.reservation')
  if (key === 'reservedAt') return t('owner.financeTable.reservedAt')
  if (key === 'paidAt') return t('owner.financeTable.paidAt')
  if (key === 'guest') return t('owner.financeTable.guest')
  if (key === 'method') return t('owner.financeTable.method')
  return t('owner.financeTable.income')
}
</script>

<template>
  <div class="space-y-2">
    <div
      v-if="showSession"
      class="canva-session-filter-row"
      role="group"
      :aria-label="t('owner.sessionTypeFilterHint')"
    >
      <button
        v-for="opt in sessionFilterOptions"
        :key="opt.value"
        type="button"
        class="canva-session-filter-btn"
        :class="session === opt.value ? 'canva-session-filter-btn-on' : ''"
        @click="session = opt.value"
      >
        {{ opt.label }}
      </button>
    </div>

    <div class="text-start">
      <span class="mb-1 block text-xs font-bold text-brand-navy">{{ t('owner.financeTable.legendFilter') }}</span>
      <div class="canva-session-filter-row" role="group" :aria-label="t('owner.financeTable.legendFilter')">
        <button
          v-for="opt in legendOptions"
          :key="opt.value"
          type="button"
          class="canva-session-filter-btn"
          :class="legend === opt.value ? 'canva-session-filter-btn-on' : ''"
          @click="legend = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <div class="text-start">
      <span class="mb-1 block text-xs font-bold text-brand-navy">{{ t('owner.financeTable.bookingKind') }}</span>
      <div class="canva-session-filter-row" role="group" :aria-label="t('owner.financeTable.bookingKind')">
        <button
          v-for="opt in visibleKindOptions"
          :key="opt.value"
          type="button"
          class="canva-session-filter-btn"
          :class="bookingKind === opt.value ? 'canva-session-filter-btn-on' : ''"
          @click="bookingKind = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <div class="text-start">
      <span class="mb-1 block text-xs font-bold text-brand-navy">{{ t('owner.financeTable.paymentFilter') }}</span>
      <div class="canva-session-filter-row" role="group" :aria-label="t('owner.financeTable.paymentFilter')">
        <button
          v-for="opt in paymentOptions"
          :key="opt.value"
          type="button"
          class="canva-session-filter-btn"
          :class="payment === opt.value ? 'canva-session-filter-btn-on' : ''"
          @click="payment = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <label class="block text-start">
      <span class="mb-1 block text-xs font-bold text-brand-navy">{{ t('owner.financeTable.guestSearch') }}</span>
      <input
        v-model="guest"
        type="search"
        class="canva-finance-date w-full"
        :placeholder="t('owner.financeTable.guestSearch')"
        :aria-label="t('owner.financeTable.guestSearch')"
      >
    </label>

    <label class="block text-start">
      <span class="mb-1 block text-xs font-bold text-brand-navy">{{ t('owner.financeTable.discountSearch') }}</span>
      <input
        v-model="discountCode"
        type="search"
        dir="ltr"
        class="canva-finance-date w-full"
        :placeholder="t('owner.financeTable.discountSearch')"
        :aria-label="t('owner.financeTable.discountSearch')"
      >
    </label>

    <div class="grid grid-cols-1 gap-2 min-[431px]:grid-cols-2">
      <div class="text-start">
        <span class="mb-1 block text-xs font-bold text-brand-navy">{{ t('owner.financeTable.reservedAt') }}</span>
        <span class="flex gap-2">
          <input
            v-model="reservedFrom"
            type="date"
            dir="ltr"
            class="canva-finance-date tabular-nums"
            :aria-label="`${t('owner.financeTable.reservedAt')} ${t('owner.financeTable.dateFrom')}`"
          >
          <input
            v-model="reservedTo"
            type="date"
            dir="ltr"
            class="canva-finance-date tabular-nums"
            :aria-label="`${t('owner.financeTable.reservedAt')} ${t('owner.financeTable.dateTo')}`"
          >
        </span>
      </div>
      <div class="text-start">
        <span class="mb-1 block text-xs font-bold text-brand-navy">{{ t('owner.financeTable.paidAt') }}</span>
        <span class="flex gap-2">
          <input
            v-model="paidFrom"
            type="date"
            dir="ltr"
            class="canva-finance-date tabular-nums"
            :aria-label="`${t('owner.financeTable.paidAt')} ${t('owner.financeTable.dateFrom')}`"
          >
          <input
            v-model="paidTo"
            type="date"
            dir="ltr"
            class="canva-finance-date tabular-nums"
            :aria-label="`${t('owner.financeTable.paidAt')} ${t('owner.financeTable.dateTo')}`"
          >
        </span>
      </div>
    </div>

    <button
      v-if="hasDateFilter"
      type="button"
      class="canva-session-filter-btn"
      @click="clearDates"
    >
      {{ t('owner.financeTable.clearDates') }}
    </button>

    <label
      v-if="sortMode !== 'never'"
      class="flex items-center gap-2 text-start text-xs font-bold text-brand-navy"
      :class="sortMode === 'narrow' ? 'min-[431px]:hidden' : ''"
    >
      <span>{{ t('owner.financeTable.sortBy') }}</span>
      <select v-model="sortKey" class="canva-finance-date" dir="rtl">
        <option v-for="key in sortOptions" :key="key" :value="key">{{ sortLabel(key) }}</option>
      </select>
      <button
        type="button"
        class="canva-session-filter-btn"
        @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
      >
        {{ sortDir === 'asc' ? '↑' : '↓' }}
      </button>
    </label>
  </div>
</template>
