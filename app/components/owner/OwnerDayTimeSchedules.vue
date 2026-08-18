<script setup lang="ts">
import { hourFromTime, type DayTimeRange } from '#shared/recurringSessions.ts'

const dayTimes = defineModel<Record<string, DayTimeRange>>('dayTimes', { required: true })

const props = withDefaults(defineProps<{
  days: string[]
  options?: string[]
  compact?: boolean
  /** One start/end pair written to every selected day. */
  shared?: boolean
}>(), {
  compact: false,
  shared: false,
})

const { t } = useI18n()

const DEFAULT_RANGE: DayTimeRange = { start: '08:00', end: '17:00' }

function rangeForDay(day: string): DayTimeRange {
  return dayTimes.value[day] || { start: '12:00', end: '13:00' }
}

const sharedRange = computed(() => {
  const first = props.days[0]
  return first ? rangeForDay(first) : DEFAULT_RANGE
})

function endAfter(start: string, end: string): string {
  if (hourFromTime(end) > hourFromTime(start)) return end
  const options = props.options || ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00']
  const next = options.find((time) => hourFromTime(time) > hourFromTime(start))
  return next || start
}

function updateDayStart(day: string, start: string) {
  const current = rangeForDay(day)
  dayTimes.value = {
    ...dayTimes.value,
    [day]: { start, end: endAfter(start, current.end) },
  }
}

function updateDayEnd(day: string, end: string) {
  const current = rangeForDay(day)
  dayTimes.value = {
    ...dayTimes.value,
    [day]: { start: current.start, end },
  }
}

function updateSharedStart(start: string) {
  const next = { ...dayTimes.value }
  for (const day of props.days) {
    const current = next[day] || DEFAULT_RANGE
    next[day] = { start, end: endAfter(start, current.end) }
  }
  dayTimes.value = next
}

function updateSharedEnd(end: string) {
  const next = { ...dayTimes.value }
  for (const day of props.days) {
    const current = next[day] || DEFAULT_RANGE
    next[day] = { start: current.start, end }
  }
  dayTimes.value = next
}
</script>

<template>
  <div v-if="compact" class="space-y-3">
    <OwnerCompactTimeRange
      v-if="shared || days.length <= 1"
      :start-time="sharedRange.start"
      :end-time="sharedRange.end"
      :options="options"
      @update:start-time="updateSharedStart"
      @update:end-time="updateSharedEnd"
    />
    <template v-else>
      <div v-for="day in days" :key="day" class="space-y-2">
        <p class="text-xs font-bold text-brand-navy">{{ t(`owner.weekdays.${day}`) }}</p>
        <OwnerCompactTimeRange
          :start-time="rangeForDay(day).start"
          :end-time="rangeForDay(day).end"
          :options="options"
          @update:start-time="updateDayStart(day, $event)"
          @update:end-time="updateDayEnd(day, $event)"
        />
      </div>
    </template>
    <p v-if="!days.length" class="text-xs text-brand-gray-600">{{ t('owner.seasonPage.selectWeekdays') }}</p>
  </div>
  <div v-else class="space-y-4">
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
