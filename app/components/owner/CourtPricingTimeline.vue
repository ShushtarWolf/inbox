<script setup lang="ts">
import {
  buildHourlyOptions,
} from '#shared/courtFacilities.ts'
import {
  defaultCourtPricingConfig,
  parseCourtPricingJson,
  serializeCourtPricingJson,
  type CourtPricingConfig,
  type CourtTimeBand,
} from '#shared/courtPricing.ts'

const props = defineProps<{
  modelValue: string | null | undefined
  basePrice: number
  openHour: number
  closeHour: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const { t } = useI18n()

const config = reactive<CourtPricingConfig>(defaultCourtPricingConfig())

/** Start times: exclusive of close (cannot start at midnight close). */
const timeOptions = computed(() => buildHourlyOptions(props.openHour, props.closeHour))
/** End times: include close so bands can cover through 24:00. */
const endTimeOptions = computed(() => buildHourlyOptions(props.openHour, props.closeHour, 60, true))

watch(() => props.modelValue, (value) => {
  const parsed = parseCourtPricingJson(value)
  config.timeBands = parsed.timeBands?.length ? [...parsed.timeBands] : []
  config.lastSecondDiscount = parsed.lastSecondDiscount || defaultCourtPricingConfig().lastSecondDiscount
}, { immediate: true })

watch(config, () => {
  emit('update:modelValue', serializeCourtPricingJson(config))
}, { deep: true })

function addTimeBand() {
  const bands = config.timeBands || []
  const starts = timeOptions.value
  const ends = endTimeOptions.value
  const lastEnd = bands.length ? bands[bands.length - 1]!.endTime : starts[0] || '09:00'
  const startIdx = starts.indexOf(lastEnd)
  const startTime = startIdx >= 0 && startIdx < starts.length
    ? starts[startIdx]!
    : starts[0] || '08:00'
  const endFromStart = ends.indexOf(startTime)
  const endIdx = Math.min(ends.length - 1, (endFromStart >= 0 ? endFromStart : 0) + 2)
  const endTime = ends[endIdx] || '10:00'
  config.timeBands = [
    ...bands,
    {
      labelFa: '',
      labelEn: '',
      startTime,
      endTime,
      price: props.basePrice,
    },
  ]
}

function removeTimeBand(index: number) {
  config.timeBands = (config.timeBands || []).filter((_, i) => i !== index)
}

function updateBand(index: number, patch: Partial<CourtTimeBand>) {
  const bands = [...(config.timeBands || [])]
  const current = bands[index]
  if (!current) return
  bands[index] = { ...current, ...patch }
  config.timeBands = bands
}

function endOptionsFor(startTime: string) {
  const startIdx = endTimeOptions.value.indexOf(startTime)
  if (startIdx < 0) {
    return endTimeOptions.value.filter((time) => time > startTime)
  }
  return endTimeOptions.value.filter((_, idx) => idx > startIdx)
}
</script>

<template>
  <div class="canva-court-pricing space-y-3">
    <div class="flex items-center justify-between gap-2">
      <div class="min-w-0 text-start">
        <h3 class="text-sm font-bold text-brand-navy">{{ t('owner.settingsPage.pricingTimeline') }}</h3>
        <p class="mt-0.5 text-xs text-brand-gray-600">{{ t('owner.settingsPage.pricingTimelineHint') }}</p>
      </div>
      <button type="button" class="canva-owner-add-band" @click="addTimeBand">
        {{ t('owner.settingsPage.addTimeBand') }}
      </button>
    </div>

    <p v-if="!(config.timeBands || []).length" class="text-xs text-brand-gray-600">
      {{ t('owner.settingsPage.pricingTimelineEmpty') }}
    </p>

    <ul class="space-y-2">
      <li
        v-for="(band, index) in config.timeBands || []"
        :key="index"
        class="canva-court-pricing-band"
      >
        <div class="grid grid-cols-3 gap-2">
          <label class="block text-xs">
            <span class="mb-1 block font-bold">{{ t('owner.seasonPage.startTime') }}</span>
            <select
              :value="band.startTime"
              class="neo-select"
              @change="updateBand(index, { startTime: ($event.target as HTMLSelectElement).value })"
            >
              <option v-for="time in timeOptions" :key="`start-${index}-${time}`" :value="time">
                {{ time }}
              </option>
            </select>
          </label>
          <label class="block text-xs">
            <span class="mb-1 block font-bold">{{ t('owner.seasonPage.endTime') }}</span>
            <select
              :value="band.endTime"
              class="neo-select"
              @change="updateBand(index, { endTime: ($event.target as HTMLSelectElement).value })"
            >
              <option v-for="time in endOptionsFor(band.startTime)" :key="`end-${index}-${time}`" :value="time">
                {{ time }}
              </option>
            </select>
          </label>
          <label class="block text-xs">
            <span class="mb-1 block font-bold">{{ t('owner.settingsPage.bandPrice') }}</span>
            <input
              :value="band.price"
              type="number"
              min="0"
              dir="ltr"
              class="neo-input tabular-nums"
              @input="updateBand(index, { price: Number(($event.target as HTMLInputElement).value) })"
            >
          </label>
        </div>
        <button type="button" class="mt-2 text-xs font-bold text-red-600" @click="removeTimeBand(index)">
          {{ t('common.delete') }}
        </button>
      </li>
    </ul>

    <div class="space-y-3 border-t border-brand-gray-200 pt-3">
      <label class="canva-settings-check">
        <input v-model="config.lastSecondDiscount!.enabled" type="checkbox" class="canva-settings-checkbox">
        <span>
          <span class="font-bold">{{ t('owner.settingsPage.lastSecondDiscount') }}</span>
          <span class="mt-0.5 block text-xs font-normal text-brand-gray-600">{{ t('owner.settingsPage.lastSecondDiscountHint') }}</span>
        </span>
      </label>
      <div v-if="config.lastSecondDiscount?.enabled" class="grid grid-cols-2 gap-2">
        <label class="block text-xs">
          <span class="mb-1 block font-bold">{{ t('owner.settingsPage.hoursBeforeStart') }}</span>
          <input v-model.number="config.lastSecondDiscount.hoursBefore" type="number" min="0" max="48" dir="ltr" class="neo-input tabular-nums">
        </label>
        <label class="block text-xs">
          <span class="mb-1 block font-bold">{{ t('owner.settingsPage.discountPercent') }}</span>
          <input v-model.number="config.lastSecondDiscount.percent" type="number" min="0" max="100" dir="ltr" class="neo-input tabular-nums">
        </label>
      </div>
    </div>
  </div>
</template>
