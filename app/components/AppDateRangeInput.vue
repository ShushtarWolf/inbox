<script setup lang="ts">
const start = defineModel<string>('start', { required: true })
const end = defineModel<string>('end', { required: true })

const props = withDefaults(defineProps<{
  startLabel?: string
  endLabel?: string
  invalid?: boolean
  invalidMessage?: string
}>(), {
  invalid: false,
})

const { t, locale } = useI18n()
const { formatDate } = useFormatters()

const isFa = computed(() => locale.value === 'fa')

const startLabelText = computed(() => props.startLabel || t('owner.packagesPage.startDate'))
const endLabelText = computed(() => props.endLabel || t('owner.packagesPage.finishDate'))

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
    <template v-if="isFa">
      <p class="text-xs font-bold text-brand-gray-600">{{ t('owner.packagesPage.dateRange') }}</p>
      <AppJalaliCalendar
        v-model="calendarStart"
        v-model:range-end="end"
        mode="range"
      />
      <p v-if="rangeHint" class="text-xs text-brand-gray-600" dir="auto">{{ rangeHint }}</p>
    </template>
    <template v-else>
      <label class="block space-y-1">
        <span class="text-sm font-bold text-brand-gray-600">{{ startLabelText }}</span>
        <input
          v-model="start"
          type="date"
          dir="ltr"
          class="neo-input tabular-nums"
        >
      </label>
      <label class="block space-y-1">
        <span class="text-sm font-bold text-brand-gray-600">{{ endLabelText }}</span>
        <input
          v-model="end"
          type="date"
          dir="ltr"
          class="neo-input tabular-nums"
        >
      </label>
    </template>
    <p v-if="invalid && invalidMessage" class="text-sm text-red-600">{{ invalidMessage }}</p>
  </div>
</template>
