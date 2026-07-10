<script setup lang="ts">
import { PERSIAN_MONTHS, isoToJalaali, jalaaliDaysInMonth, jalaaliToIso } from '#shared/jalali.ts'

const model = defineModel<string>({ required: true })

const props = withDefaults(defineProps<{
  label?: string
  showFormattedHint?: boolean
}>(), {
  showFormattedHint: true,
})

const { t, locale } = useI18n()
const { formatDate, formatNumber } = useFormatters()

const isFa = computed(() => locale.value === 'fa')

const jalaliYear = ref(1404)
const jalaliMonth = ref(1)
const jalaliDay = ref(1)

const formattedHint = computed(() => {
  if (!props.showFormattedHint || !model.value || isFa.value) return ''
  return formatDate(model.value)
})

const jalaliYears = computed(() => {
  const current = jalaliYear.value
  return Array.from({ length: 11 }, (_, index) => current - 5 + index)
})

const jalaliDays = computed(() => {
  const count = jalaaliDaysInMonth(jalaliYear.value, jalaliMonth.value)
  return Array.from({ length: count }, (_, index) => index + 1)
})

function syncJalaliFromModel() {
  if (!model.value) return
  const j = isoToJalaali(model.value)
  jalaliYear.value = j.jy
  jalaliMonth.value = j.jm
  jalaliDay.value = j.jd
}

function syncModelFromJalali() {
  const maxDay = jalaaliDaysInMonth(jalaliYear.value, jalaliMonth.value)
  if (jalaliDay.value > maxDay) jalaliDay.value = maxDay
  const next = jalaaliToIso(jalaliYear.value, jalaliMonth.value, jalaliDay.value)
  if (next !== model.value) model.value = next
}

watch(model, syncJalaliFromModel, { immediate: true })
watch([jalaliYear, jalaliMonth, jalaliDay], syncModelFromJalali)

// #region agent log
watch([model, locale], ([dateValue, currentLocale]) => {
  fetch('http://127.0.0.1:7459/ingest/150d6ec9-7ea4-4890-8fdc-843d504b2806', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ab2367' }, body: JSON.stringify({ sessionId: 'ab2367', location: 'AppDateInput.vue:watch', message: 'date input state', data: { locale: currentLocale, model: dateValue, isFa: currentLocale === 'fa', jalali: currentLocale === 'fa' ? { jy: jalaliYear.value, jm: jalaliMonth.value, jd: jalaliDay.value } : null }, timestamp: Date.now(), hypothesisId: 'H4-H6' }) }).catch(() => {})
}, { immediate: true })
// #endregion
</script>

<template>
  <label class="block space-y-1">
    <span v-if="label || $slots.label" class="text-sm font-bold text-brand-gray-600">
      <slot name="label">{{ label || t('common.date') }}</slot>
    </span>

    <div v-if="isFa" class="flex flex-wrap items-center gap-1">
      <select
        v-model.number="jalaliDay"
        class="rounded-xl border border-black/10 bg-white px-2 py-2 text-sm"
        :aria-label="t('common.date')"
      >
        <option v-for="day in jalaliDays" :key="day" :value="day">{{ formatNumber(day) }}</option>
      </select>
      <select
        v-model.number="jalaliMonth"
        class="min-w-[6.5rem] rounded-xl border border-black/10 bg-white px-2 py-2 text-sm"
        :aria-label="t('common.date')"
      >
        <option v-for="(month, index) in PERSIAN_MONTHS" :key="month" :value="index + 1">{{ month }}</option>
      </select>
      <select
        v-model.number="jalaliYear"
        class="rounded-xl border border-black/10 bg-white px-2 py-2 text-sm tabular-nums"
        dir="ltr"
        :aria-label="t('common.date')"
      >
        <option v-for="year in jalaliYears" :key="year" :value="year">{{ formatNumber(year) }}</option>
      </select>
    </div>

    <input
      v-else
      v-model="model"
      type="date"
      dir="ltr"
      class="w-full rounded-xl border border-black/10 px-3 py-2 tabular-nums"
    >

    <p v-if="formattedHint" class="text-xs text-brand-gray-600" dir="auto">{{ formattedHint }}</p>
  </label>
</template>
