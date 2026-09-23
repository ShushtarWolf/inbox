<script setup lang="ts">
const start = defineModel<string>('start', { required: true })
const end = defineModel<string>('end', { required: true })

const props = withDefaults(defineProps<{
  startLabel?: string
  endLabel?: string
  invalid?: boolean
  invalidMessage?: string
  minDate?: string
  /** When wrapped in AppFormField, hide the duplicate inner label. */
  hideLabel?: boolean
  dayMarks?: Record<string, 'busy' | 'soft'>
}>(), {
  invalid: false,
  minDate: '',
  hideLabel: false,
  dayMarks: () => ({}),
})

const { t } = useI18n()
const { formatDate } = useFormatters()
const { today } = useLocalDate()

const effectiveMinDate = computed(() => {
  const raw = props.minDate as unknown
  if (typeof raw === 'function') {
    try {
      const result = (raw as () => string)()
      return typeof result === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : today()
    }
    catch {
      return today()
    }
  }
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return today()
})

const rangeHint = computed(() => {
  if (!start.value && !end.value) return ''
  if (start.value && end.value) {
    return t('owner.packagesPage.rangeSelected', {
      start: formatDate(start.value),
      end: formatDate(end.value),
    })
  }
  if (start.value) return t('owner.packagesPage.rangePickEnd', { start: formatDate(start.value) })
  return ''
})

const rangeComplete = computed(() => Boolean(start.value && end.value))

// FA range calendar needs a bound start for v-model; use today placeholder until set
const calendarStart = computed({
  get: () => start.value || end.value || new Date().toISOString().slice(0, 10),
  set: (value: string) => {
    start.value = value
  },
})
</script>

<template>
  <div class="space-y-2">
    <p v-if="!hideLabel" class="text-xs font-bold text-brand-gray-600">{{ t('owner.packagesPage.dateRange') }}</p>
    <p
      v-if="rangeHint"
      class="text-start text-xs font-bold"
      :class="rangeComplete ? 'text-brand-primary' : 'text-brand-gray-600'"
      dir="auto"
    >
      {{ rangeHint }}
    </p>
    <AppJalaliCalendar
      v-model="calendarStart"
      v-model:range-end="end"
      mode="range"
      :min-date="effectiveMinDate"
      :day-marks="dayMarks"
    />
    <p v-if="!rangeComplete && start" class="text-start text-[11px] font-medium text-brand-gray-500">
      {{ t('owner.packagesPage.rangePickEndHint') }}
    </p>
    <p v-else-if="rangeComplete" class="text-start text-[11px] font-medium text-brand-gray-500">
      {{ t('owner.packagesPage.rangeAdjustHint') }}
    </p>
    <p v-if="invalid && invalidMessage" class="text-sm text-red-600">{{ invalidMessage }}</p>
  </div>
</template>
