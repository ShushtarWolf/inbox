<script setup lang="ts">
import type { FinanceSessionFilter, FinanceTxSortDir, FinanceTxSortKey } from '#shared/financeTransactions.ts'

const session = defineModel<FinanceSessionFilter>('session', { required: true })
const reservedFrom = defineModel<string>('reservedFrom', { required: true })
const reservedTo = defineModel<string>('reservedTo', { required: true })
const paidFrom = defineModel<string>('paidFrom', { required: true })
const paidTo = defineModel<string>('paidTo', { required: true })
const sortKey = defineModel<FinanceTxSortKey>('sortKey', { required: true })
const sortDir = defineModel<FinanceTxSortDir>('sortDir', { required: true })

withDefaults(defineProps<{
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

const sortOptions: FinanceTxSortKey[] = ['reservation', 'reservedAt', 'paidAt', 'guest', 'method', 'amount']

const hasDateFilter = computed(() => Boolean(reservedFrom.value || reservedTo.value || paidFrom.value || paidTo.value))

function clearDates() {
  reservedFrom.value = ''
  reservedTo.value = ''
  paidFrom.value = ''
  paidTo.value = ''
}

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
