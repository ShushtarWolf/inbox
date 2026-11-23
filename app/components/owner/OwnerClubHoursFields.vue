<script setup lang="ts">
const openHour = defineModel<number>('openHour', { required: true })
const closeHour = defineModel<number>('closeHour', { required: true })

const props = withDefaults(defineProps<{
  showHeading?: boolean
}>(), {
  showHeading: true,
})

const { t } = useI18n()
const { formatFaDigits } = useFormatters()

const openOptions = Array.from({ length: 24 }, (_, i) => i)
const closeOptions = Array.from({ length: 24 }, (_, i) => i + 1)

function hourOptionLabel(hour: number) {
  return formatFaDigits(`${String(hour).padStart(2, '0')}:00`)
}

watch(openHour, (open) => {
  if (closeHour.value <= open) {
    closeHour.value = Math.min(open + 1, 24)
  }
})
</script>

<template>
  <div class="space-y-2">
    <h3 v-if="showHeading" class="text-sm font-bold text-brand-navy">{{ t('owner.settingsPage.clubHours') }}</h3>
    <p v-if="showHeading" class="text-xs text-brand-gray-600">{{ t('owner.settingsPage.clubHoursHint') }}</p>
    <div class="grid grid-cols-2 gap-3">
      <AppFormField :field-id="showHeading ? 'owner-club-open-hour' : undefined" :label="t('owner.settingsPage.openHour')">
        <select
          :id="showHeading ? 'owner-club-open-hour' : undefined"
          v-model.number="openHour"
          class="neo-select tabular-nums"
          dir="ltr"
        >
          <option v-for="h in openOptions" :key="`open-${h}`" :value="h">{{ hourOptionLabel(h) }}</option>
        </select>
      </AppFormField>
      <AppFormField :field-id="showHeading ? 'owner-club-close-hour' : undefined" :label="t('owner.settingsPage.closeHour')">
        <select
          :id="showHeading ? 'owner-club-close-hour' : undefined"
          v-model.number="closeHour"
          class="neo-select tabular-nums"
          dir="ltr"
        >
          <option v-for="h in closeOptions" :key="`close-${h}`" :value="h" :disabled="h <= openHour">
            {{ hourOptionLabel(h) }}
          </option>
        </select>
      </AppFormField>
    </div>
  </div>
</template>