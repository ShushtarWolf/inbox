<script setup lang="ts">
import { PERSIAN_MONTHS, isoToJalaali, jalaaliDaysInMonth, jalaaliToIso } from '#shared/jalali.ts'

const model = defineModel<string>({ required: true })

const emit = defineEmits<{
  select: []
}>()

const { formatNumber } = useFormatters()

const PERSIAN_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const

const viewYear = ref(1404)
const viewMonth = ref(1)

function syncViewFromModel() {
  if (!model.value) return
  const j = isoToJalaali(model.value)
  viewYear.value = j.jy
  viewMonth.value = j.jm
}

watch(model, syncViewFromModel, { immediate: true })

const monthLabel = computed(() => `${PERSIAN_MONTHS[viewMonth.value - 1]} ${formatNumber(viewYear.value)}`)

const calendarCells = computed(() => {
  const daysInMonth = jalaaliDaysInMonth(viewYear.value, viewMonth.value)
  const [gy, gm, gd] = jalaaliToIso(viewYear.value, viewMonth.value, 1).split('-').map(Number)
  const weekday = new Date(gy, gm - 1, gd).getDay()
  const leadingBlanks = (weekday + 1) % 7

  const cells: Array<{ day: number | null; iso: string | null }> = []
  for (let i = 0; i < leadingBlanks; i++) cells.push({ day: null, iso: null })
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, iso: jalaaliToIso(viewYear.value, viewMonth.value, day) })
  }
  return cells
})

function prevMonth() {
  if (viewMonth.value === 1) {
    viewMonth.value = 12
    viewYear.value -= 1
    return
  }
  viewMonth.value -= 1
}

function nextMonth() {
  if (viewMonth.value === 12) {
    viewMonth.value = 1
    viewYear.value += 1
    return
  }
  viewMonth.value += 1
}

function selectDay(iso: string) {
  model.value = iso
  emit('select')
}

function isSelected(cell: { iso: string | null }) {
  return Boolean(cell.iso && cell.iso === model.value)
}
</script>

<template>
  <div class="jalali-calendar rounded-venus border border-brand-gray-100 bg-white p-4 shadow-venus">
    <div class="mb-3 flex items-center justify-between gap-2">
      <button type="button" class="jalali-calendar-nav" aria-label="ماه قبل" @click="prevMonth">
        <AppIcon name="chevron_left" size="sm" />
      </button>
      <p class="text-sm font-bold text-brand-navy">{{ monthLabel }}</p>
      <button type="button" class="jalali-calendar-nav" aria-label="ماه بعد" @click="nextMonth">
        <AppIcon name="chevron_right" size="sm" />
      </button>
    </div>

    <div class="grid grid-cols-7 gap-1 text-center text-xs font-bold text-brand-navy/50">
      <span v-for="weekday in PERSIAN_WEEKDAYS" :key="weekday">{{ weekday }}</span>
    </div>

    <div class="mt-1 grid grid-cols-7 gap-1">
      <span v-for="(cell, index) in calendarCells" :key="index">
        <button
          v-if="cell.day && cell.iso"
          type="button"
          class="jalali-calendar-day"
          :class="isSelected(cell) ? 'jalali-calendar-day-selected' : ''"
          @click="selectDay(cell.iso!)"
        >
          {{ formatNumber(cell.day) }}
        </button>
      </span>
    </div>
  </div>
</template>

<style scoped>
.jalali-calendar {
  width: min(100vw - 2rem, 18rem);
}

.jalali-calendar-nav {
  display: inline-flex;
  height: 2rem;
  width: 2rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  border: 1px solid #e0e5f2;
  background: #f4f7fe;
  color: #4318ff;
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1;
}

.jalali-calendar-day {
  display: flex;
  height: 2.25rem;
  width: 100%;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: #2b3674;
}

.jalali-calendar-day:hover {
  background: #e9edf7;
}

.jalali-calendar-day-selected {
  background: #4318ff;
  color: #fff;
}

.jalali-calendar-day-selected:hover {
  background: #3311db;
}
</style>
