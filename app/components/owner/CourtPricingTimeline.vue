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

const timeOptions = computed(() => buildHourlyOptions(props.openHour, props.closeHour))

watch(() => props.modelValue, (value) => {
  const parsed = parseCourtPricingJson(value)
  config.timeBands = parsed.timeBands?.length ? [...parsed.timeBands] : []
  config.lastSecondDiscount = parsed.lastSecondDiscount || defaultCourtPricingConfig().lastSecondDiscount
  config.offPeakDiscount = parsed.offPeakDiscount || defaultCourtPricingConfig().offPeakDiscount
}, { immediate: true })

watch(config, () => {
  emit('update:modelValue', serializeCourtPricingJson(config))
}, { deep: true })

function addTimeBand() {
  const bands = config.timeBands || []
  const lastEnd = bands.length ? bands[bands.length - 1].endTime : timeOptions.value[0] || '09:00'
  const startIdx = timeOptions.value.indexOf(lastEnd)
  const startTime = startIdx >= 0 && startIdx < timeOptions.value.length - 1
    ? timeOptions.value[startIdx]
    : timeOptions.value[0] || '08:00'
  const endIdx = Math.min(timeOptions.value.length - 1, (startIdx >= 0 ? startIdx : 0) + 2)
  const endTime = timeOptions.value[endIdx] || '10:00'
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
  bands[index] = { ...bands[index], ...patch }
  config.timeBands = bands
}

function endOptionsFor(startTime: string) {
  const startIdx = timeOptions.value.indexOf(startTime)
  return timeOptions.value.filter((_, idx) => idx > startIdx)
}
</script>

<template>
  <div class="space-y-4 rounded-venus border border-brand-gray-100 bg-brand-cream/30 p-4">
    <div>
      <div class="flex items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-bold">{{ t('owner.settingsPage.pricingTimeline') }}</h3>
          <p class="mt-0.5 text-xs text-brand-gray-600">{{ t('owner.settingsPage.pricingTimelineHint') }}</p>
        </div>
        <button type="button" class="btn-secondary text-xs" @click="addTimeBand">
          {{ t('owner.settingsPage.addTimeBand') }}
        </button>
      </div>

      <p v-if="!(config.timeBands || []).length" class="mt-2 text-xs text-brand-gray-600">
        {{ t('owner.settingsPage.pricingTimelineEmpty') }}
      </p>

      <ul class="mt-3 space-y-2">
        <li
          v-for="(band, index) in config.timeBands || []"
          :key="index"
          class="rounded-venus border border-brand-gray-100 bg-white p-3"
        >
          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
            <div class="flex items-end">
              <button type="button" class="btn-ghost text-xs text-red-600" @click="removeTimeBand(index)">
                {{ t('common.delete') }}
              </button>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <div class="border-t border-brand-gray-100 pt-4">
      <label class="flex items-center gap-2 text-sm">
        <input v-model="config.lastSecondDiscount!.enabled" type="checkbox" class="rounded">
        <span class="font-bold">{{ t('owner.settingsPage.lastSecondDiscount') }}</span>
      </label>
      <p class="mt-1 text-xs text-brand-gray-600">{{ t('owner.settingsPage.lastSecondDiscountHint') }}</p>
      <div v-if="config.lastSecondDiscount?.enabled" class="mt-3 grid gap-2 sm:grid-cols-2">
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

    <div class="border-t border-brand-gray-100 pt-4">
      <label class="flex items-center gap-2 text-sm">
        <input v-model="config.offPeakDiscount!.enabled" type="checkbox" class="rounded">
        <span class="font-bold">{{ t('owner.settingsPage.offPeakDiscount') }}</span>
      </label>
      <p class="mt-1 text-xs text-brand-gray-600">{{ t('owner.settingsPage.offPeakDiscountHint') }}</p>
      <div v-if="config.offPeakDiscount?.enabled" class="mt-3 grid gap-2 sm:grid-cols-3">
        <label class="block text-xs">
          <span class="mb-1 block font-bold">{{ t('owner.seasonPage.startTime') }}</span>
          <select v-model="config.offPeakDiscount.startTime" class="neo-select">
            <option v-for="time in timeOptions" :key="`off-start-${time}`" :value="time">{{ time }}</option>
          </select>
        </label>
        <label class="block text-xs">
          <span class="mb-1 block font-bold">{{ t('owner.seasonPage.endTime') }}</span>
          <select v-model="config.offPeakDiscount.endTime" class="neo-select">
            <option v-for="time in timeOptions" :key="`off-end-${time}`" :value="time">{{ time }}</option>
          </select>
        </label>
        <label class="block text-xs">
          <span class="mb-1 block font-bold">{{ t('owner.settingsPage.discountPercent') }}</span>
          <input v-model.number="config.offPeakDiscount.percent" type="number" min="0" max="100" dir="ltr" class="neo-input tabular-nums">
        </label>
      </div>
    </div>
  </div>
</template>
