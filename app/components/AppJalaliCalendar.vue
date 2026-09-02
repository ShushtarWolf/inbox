<script setup lang="ts">
import { PERSIAN_MONTHS, isoToJalaali, jalaaliDaysInMonth, jalaaliToIso } from '#shared/jalali.ts'

const model = defineModel<string>({ required: true })
const rangeEnd = defineModel<string>('rangeEnd', { default: '' })

const props = withDefaults(defineProps<{
  mode?: 'single' | 'range'
  minDate?: string
  variant?: 'default' | 'owner'
  dayMarks?: Record<string, 'busy' | 'soft'>
}>(), {
  mode: 'single',
  minDate: '',
  variant: 'default',
  dayMarks: () => ({}),
})

const emit = defineEmits<{
  select: []
}>()

const { formatNumber, formatYear } = useFormatters()
const { t } = useI18n()
const { today } = useLocalDate()

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

const monthLabel = computed(() => `${PERSIAN_MONTHS[viewMonth.value - 1]} ${formatYear(viewYear.value)}`)

const calendarCells = computed(() => {
  const daysInMonth = jalaaliDaysInMonth(viewYear.value, viewMonth.value)
  const isoParts = jalaaliToIso(viewYear.value, viewMonth.value, 1).split('-').map(Number)
  const gy = isoParts[0] ?? 0
  const gm = isoParts[1] ?? 1
  const gd = isoParts[2] ?? 1
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

const todayIso = computed(() => today())

/** Only ISO YYYY-MM-DD counts — a bare `:min-date="today"` passes the function and would disable every day. */
const effectiveMinDate = computed(() => {
  const raw = props.minDate as unknown
  if (typeof raw === 'function') {
    try {
      const result = (raw as () => string)()
      return typeof result === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : ''
    }
    catch {
      return ''
    }
  }
  return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ''
})

const isViewingTodayMonth = computed(() => {
  const j = isoToJalaali(todayIso.value)
  return viewYear.value === j.jy && viewMonth.value === j.jm
})

const isOnToday = computed(() => model.value === todayIso.value)

const showTodayButton = computed(() => !isOnToday.value || !isViewingTodayMonth.value)

function goToToday() {
  const j = isoToJalaali(todayIso.value)
  viewYear.value = j.jy
  viewMonth.value = j.jm
  if (props.mode === 'single') {
    model.value = todayIso.value
    emit('select')
  }
}

function isInRange(iso: string) {
  if (props.mode !== 'range' || !model.value || !rangeEnd.value) return false
  const start = model.value <= rangeEnd.value ? model.value : rangeEnd.value
  const end = model.value <= rangeEnd.value ? rangeEnd.value : model.value
  return iso >= start && iso <= end
}

function isRangeStart(cell: { iso: string | null }) {
  if (!cell.iso || props.mode !== 'range') return false
  return cell.iso === model.value
}

function isRangeEnd(cell: { iso: string | null }) {
  if (!cell.iso || props.mode !== 'range') return false
  return cell.iso === rangeEnd.value
}

function selectDay(iso: string) {
  if (effectiveMinDate.value && iso < effectiveMinDate.value) return
  if (props.mode === 'range') {
    if (!model.value || rangeEnd.value) {
      model.value = iso
      rangeEnd.value = ''
      return
    }
    if (iso < model.value) {
      rangeEnd.value = model.value
      model.value = iso
    } else {
      rangeEnd.value = iso
    }
    emit('select')
    return
  }
  model.value = iso
  emit('select')
}

function isSelected(cell: { iso: string | null }) {
  if (!cell.iso) return false
  if (props.mode === 'range') {
    return isRangeStart(cell) || isRangeEnd(cell)
  }
  return cell.iso === model.value
}

function isDisabled(cell: { iso: string | null }) {
  return Boolean(cell.iso && effectiveMinDate.value && cell.iso < effectiveMinDate.value)
}

function cellClass(cell: { iso: string | null }) {
  if (!cell.iso) return ''
  if (isDisabled(cell)) return 'jalali-calendar-day-disabled'
  if (props.mode === 'range' && isInRange(cell.iso)) {
    if (isRangeStart(cell) || isRangeEnd(cell)) return 'jalali-calendar-day-selected'
    return 'jalali-calendar-day-in-range'
  }
  return isSelected(cell) ? 'jalali-calendar-day-selected' : ''
}
</script>

<template>
  <div class="jalali-calendar" :class="variant === 'owner' ? 'jalali-calendar-owner' : 'jalali-calendar-default'">
    <div class="mb-3 flex items-center justify-between gap-2">
      <button type="button" class="jalali-calendar-nav shrink-0" :aria-label="t('calendar.prevMonth')" @click="prevMonth">
        <AppIcon name="chevron_left" size="sm" />
      </button>
      <div class="flex min-w-0 flex-1 items-center justify-center gap-2">
        <p class="jalali-calendar-month truncate text-sm font-bold">{{ monthLabel }}</p>
        <button
          v-if="variant !== 'owner' && showTodayButton"
          type="button"
          class="jalali-calendar-today shrink-0"
          @click="goToToday"
        >
          {{ t('calendar.today') }}
        </button>
      </div>
      <button type="button" class="jalali-calendar-nav shrink-0" :aria-label="t('calendar.nextMonth')" @click="nextMonth">
        <AppIcon name="chevron_right" size="sm" />
      </button>
    </div>

    <div class="jalali-calendar-weekdays grid grid-cols-7 gap-1 text-center text-xs font-bold">
      <span v-for="weekday in PERSIAN_WEEKDAYS" :key="weekday">{{ weekday }}</span>
    </div>

    <div class="mt-1 grid grid-cols-7 gap-1">
      <span v-for="(cell, index) in calendarCells" :key="index">
        <button
          v-if="cell.day && cell.iso"
          type="button"
          class="jalali-calendar-day"
          :class="cellClass(cell)"
          :disabled="isDisabled(cell)"
          @click="selectDay(cell.iso!)"
        >
          <span>{{ formatNumber(cell.day) }}</span>
          <i
            v-if="variant === 'owner' && cell.iso && dayMarks[cell.iso]"
            class="jalali-day-dot"
            :class="dayMarks[cell.iso] === 'busy' ? 'jalali-day-dot-busy' : 'jalali-day-dot-soft'"
            aria-hidden="true"
          />
        </button>
      </span>
    </div>

    <button
      v-if="variant === 'owner' && showTodayButton"
      type="button"
      class="jalali-calendar-today-footer mt-3 w-full"
      @click="goToToday"
    >
      {{ t('calendar.today') }}
    </button>
  </div>
</template>

<style scoped>
.jalali-calendar {
  /* Relative to modal/container — 100vw ignores sheet padding and looks zoomed on phone */
  width: 100%;
  max-width: 18rem;
  margin-inline: auto;
  box-sizing: border-box;
}
.jalali-calendar-default {
  border-radius: var(--sz-canva-radius, 0);
  border: 1px solid var(--sz-border);
  background: #fff;
  padding: 1rem;
  box-shadow: var(--sz-shadow-sm, none);
}
.jalali-calendar-owner {
  background: #fff;
  padding: 0.25rem 0.15rem 0.5rem;
}
.jalali-calendar-owner .jalali-calendar-month {
  color: var(--sz-accent);
}
.jalali-calendar-owner .jalali-calendar-weekdays {
  color: var(--sz-accent);
}
.jalali-calendar-owner .jalali-calendar-nav {
  border: 0;
  background: transparent;
  color: var(--sz-accent);
  border-radius: 2px;
}
.jalali-calendar-nav {
  display: inline-flex;
  height: 2rem;
  width: 2rem;
  align-items: center;
  justify-content: center;
  border-radius: var(--sz-canva-radius, 2px);
  border: 1px solid var(--sz-border);
  background: var(--sz-bg);
  color: var(--sz-accent);
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1;
}
.jalali-calendar-today {
  border-radius: 2px;
  border: 1px solid var(--sz-border);
  background: var(--sz-bg);
  padding: 0.25rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--sz-accent);
}
.jalali-calendar-today:hover {
  background: var(--sz-bg-elevated);
}
.jalali-calendar-today-footer {
  border-radius: 2px;
  border: 1px solid var(--sz-border);
  background: var(--sz-bg);
  padding: 0.5rem 0.75rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--sz-accent);
}
.jalali-calendar-today-footer:hover {
  background: var(--sz-bg-elevated);
}
.jalali-calendar-day {
  display: flex;
  height: 2.25rem;
  width: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.1rem;
  border-radius: var(--sz-canva-radius, 2px);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--sz-navy);
}
.jalali-calendar-owner .jalali-calendar-day {
  border-radius: 2px;
}
.jalali-calendar-day:hover {
  background: var(--sz-bg-elevated);
}
.jalali-calendar-day-selected {
  background: var(--sz-accent);
  color: #fff;
}
.jalali-calendar-day-selected:hover {
  background: var(--sz-accent-dark);
}
.jalali-calendar-day-in-range {
  background: color-mix(in srgb, var(--sz-accent) 18%, transparent);
  color: var(--sz-navy);
}
.jalali-calendar-day-disabled {
  cursor: not-allowed;
  color: var(--sz-border);
  opacity: 0.45;
}
.jalali-calendar-day-disabled:hover {
  background: transparent;
}
.jalali-day-dot {
  display: block;
  height: 4px;
  width: 4px;
  border-radius: 1px;
}
.jalali-day-dot-busy {
  background: #16a34a;
}
.jalali-day-dot-soft {
  background: #c9c4bb;
}
</style>
