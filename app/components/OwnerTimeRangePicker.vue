<script setup lang="ts">
import { hourFromTime } from '#shared/recurringSessions.ts'

const startTime = defineModel<string>('startTime', { required: true })
const endTime = defineModel<string>('endTime', { required: true })

const props = withDefaults(defineProps<{
  options?: string[]
}>(), {
  options: () => ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'],
})

const { t } = useI18n()

const endOptions = computed(() => {
  const startH = hourFromTime(startTime.value)
  return props.options.filter((time) => hourFromTime(time) > startH)
})

function selectStart(time: string) {
  startTime.value = time
  if (hourFromTime(endTime.value) <= hourFromTime(time)) {
    endTime.value = endOptions.value[0] || time
  }
}

function selectEnd(time: string) {
  endTime.value = time
}
</script>

<template>
  <aside class="venus-widget-card w-full shrink-0 space-y-4 p-4 lg:w-44">
    <div>
      <h3 class="mb-3 flex items-center gap-2 text-sm font-bold text-brand-navy">
        <AppIcon name="schedule" size="sm" />
        {{ t('owner.seasonPage.startTime') }}
      </h3>
      <ul class="max-h-[min(200px,28dvh)] space-y-1 overflow-y-auto overscroll-contain">
        <li v-for="time in options" :key="`start-${time}`">
          <button
            type="button"
            class="block w-full rounded-venus px-3 py-2 text-start text-sm font-semibold transition"
            :class="startTime === time ? 'bg-brand-primary text-white shadow-venus-sm' : 'text-brand-gray-600 hover:bg-brand-lavender hover:text-brand-primary'"
            @click="selectStart(time)"
          >
            <bdi dir="ltr" class="tabular-nums">{{ time }}</bdi>
          </button>
        </li>
      </ul>
    </div>
    <div>
      <h3 class="mb-3 flex items-center gap-2 text-sm font-bold text-brand-navy">
        <AppIcon name="schedule" size="sm" />
        {{ t('owner.seasonPage.endTime') }}
      </h3>
      <ul class="max-h-[min(200px,28dvh)] space-y-1 overflow-y-auto overscroll-contain">
        <li v-for="time in endOptions" :key="`end-${time}`">
          <button
            type="button"
            class="block w-full rounded-venus px-3 py-2 text-start text-sm font-semibold transition"
            :class="endTime === time ? 'bg-brand-primary text-white shadow-venus-sm' : 'text-brand-gray-600 hover:bg-brand-lavender hover:text-brand-primary'"
            @click="selectEnd(time)"
          >
            <bdi dir="ltr" class="tabular-nums">{{ time }}</bdi>
          </button>
        </li>
      </ul>
    </div>
  </aside>
</template>
