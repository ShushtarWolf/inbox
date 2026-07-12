<script setup lang="ts">
import type { DayTimeRange } from '#shared/recurringSessions.ts'

const dayTimes = defineModel<Record<string, DayTimeRange>>('dayTimes', { required: true })

const props = defineProps<{
  days: string[]
  options?: string[]
}>()

const { t } = useI18n()

function rangeForDay(day: string): DayTimeRange {
  return dayTimes.value[day] || { start: '12:00', end: '13:00' }
}

function updateDayStart(day: string, start: string) {
  const current = rangeForDay(day)
  dayTimes.value = {
    ...dayTimes.value,
    [day]: { start, end: current.end },
  }
}

function updateDayEnd(day: string, end: string) {
  const current = rangeForDay(day)
  dayTimes.value = {
    ...dayTimes.value,
    [day]: { start: current.start, end },
  }
}
</script>

<template>
  <div class="space-y-4">
    <div
      v-for="day in days"
      :key="day"
      class="rounded-venus border border-brand-gray-100 bg-white p-3"
    >
      <p class="mb-2 text-xs font-bold text-brand-navy">{{ t(`owner.weekdays.${day}`) }}</p>
      <OwnerTimeRangePicker
        :start-time="rangeForDay(day).start"
        :end-time="rangeForDay(day).end"
        :options="options"
        class="w-full"
        @update:start-time="updateDayStart(day, $event)"
        @update:end-time="updateDayEnd(day, $event)"
      />
    </div>
    <p v-if="!days.length" class="text-xs text-brand-gray-600">{{ t('owner.seasonPage.selectWeekdays') }}</p>
  </div>
</template>
