<script setup lang="ts">
const start = defineModel<string>('start', { required: true })
const end = defineModel<string>('end', { required: true })

const props = withDefaults(defineProps<{
  startLabel?: string
  endLabel?: string
  invalid?: boolean
  invalidMessage?: string
  minDate?: string
}>(), {
  invalid: false,
  minDate: '',
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
    return `${formatDate(start.value)} – ${formatDate(end.value)}`
  }
  if (start.value) return formatDate(start.value)
  return ''
})

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
    <p class="text-xs font-bold text-brand-gray-600">{{ t('owner.packagesPage.dateRange') }}</p>
    <AppJalaliCalendar
      v-model="calendarStart"
      v-model:range-end="end"
      mode="range"
      :min-date="effectiveMinDate"
    />
    <p v-if="rangeHint" class="text-xs text-brand-gray-600" dir="auto">{{ rangeHint }}</p>
    <p v-if="invalid && invalidMessage" class="text-sm text-red-600">{{ invalidMessage }}</p>
  </div>
</template>
