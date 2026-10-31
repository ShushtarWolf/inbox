<script setup lang="ts">
import { hourFromTime, isEndAfterStart, timeToMinutes } from '#shared/recurringSessions.ts'

const startTime = defineModel<string>('startTime', { required: true })
const endTime = defineModel<string>('endTime', { required: true })

const props = withDefaults(defineProps<{
  options?: string[]
}>(), {
  options: () => ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'],
})

const { t } = useI18n()
const { formatTimeLabel } = useFormatters()

const startOptions = computed(() =>
  props.options.filter((time) => hourFromTime(time) < 24),
)

const endOptions = computed(() => {
  const startMin = timeToMinutes(startTime.value)
  return props.options.filter((time) => timeToMinutes(time) > startMin)
})

function onStartChange(event: Event) {
  const start = (event.target as HTMLSelectElement).value
  startTime.value = start
  if (!isEndAfterStart(start, endTime.value)) {
    endTime.value = endOptions.value[0] || start
  }
}

function onEndChange(event: Event) {
  endTime.value = (event.target as HTMLSelectElement).value
}
</script>

<template>
  <div class="grid grid-cols-2 gap-3">
    <AppFormField :label="t('owner.seasonPage.startTime')">
      <select
        :value="startTime"
        class="neo-select tabular-nums"
        dir="ltr"
        @change="onStartChange"
      >
        <option v-for="time in startOptions" :key="`start-${time}`" :value="time">{{ formatTimeLabel(time) }}</option>
      </select>
    </AppFormField>
    <AppFormField :label="t('owner.seasonPage.endTime')">
      <select
        :value="endTime"
        class="neo-select tabular-nums"
        dir="ltr"
        @change="onEndChange"
      >
        <option v-for="time in endOptions" :key="`end-${time}`" :value="time">{{ formatTimeLabel(time) }}</option>
      </select>
    </AppFormField>
  </div>
</template>
