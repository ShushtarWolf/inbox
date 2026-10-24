<script setup lang="ts">
import { isoToJalaali, PERSIAN_MONTHS } from '#shared/jalali.ts'

const props = defineProps<{
  months: Array<{ key: string; amount: number }>
}>()

const { formatNumber } = useFormatters()
const { t } = useI18n()

const maxAmount = computed(() =>
  Math.max(1, ...props.months.map((m) => m.amount)),
)

function barHeight(amount: number) {
  const pct = Math.round((amount / maxAmount.value) * 100)
  return `${Math.max(amount > 0 ? 8 : 4, pct)}%`
}

function monthLabel(key: string) {
  const j = isoToJalaali(`${key}-01`)
  return PERSIAN_MONTHS[j.jm - 1] || key.slice(5)
}
</script>

<template>
  <div class="coach-bar-chart" role="img" :aria-label="t('coach.dashboardRevenueChart')">
    <div class="coach-bar-chart-bars">
      <div
        v-for="item in months"
        :key="item.key"
        class="coach-bar-chart-col"
      >
        <span class="coach-bar-chart-value tabular-nums">{{ formatNumber(Math.round(item.amount / 1000)) }}k</span>
        <div class="coach-bar-chart-track">
          <div class="coach-bar-chart-fill" :style="{ height: barHeight(item.amount) }" />
        </div>
        <span class="coach-bar-chart-label">{{ monthLabel(item.key) }}</span>
      </div>
    </div>
  </div>
</template>
