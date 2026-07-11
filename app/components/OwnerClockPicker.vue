<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: string[]
  options?: string[]
}>(), {
  options: () => ['08:00', '10:00', '12:00', '13:00', '14:00', '15:00', '16:00', '18:00'],
})

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const { t } = useI18n()

const selected = computed(() => props.modelValue[0] || '')

function selectTime(time: string) {
  emit('update:modelValue', [time])
}
</script>

<template>
  <aside class="venus-widget-card p-4">
    <h3 class="mb-3 flex items-center gap-2 text-sm font-bold text-brand-navy">
      <AppIcon name="schedule" size="sm" />
      {{ t('owner.clockSelector') }}
    </h3>
    <ul class="max-h-[min(280px,36dvh)] space-y-1 overflow-y-auto overscroll-contain">
      <li v-for="time in options" :key="time">
        <button
          type="button"
          class="block w-full rounded-venus px-3 py-2 text-start text-sm font-semibold transition"
          :class="selected === time ? 'bg-brand-primary text-white shadow-venus-sm' : 'text-brand-gray-600 hover:bg-brand-lavender hover:text-brand-primary'"
          @click="selectTime(time)"
        >
          <bdi dir="ltr" class="tabular-nums">{{ time }}</bdi>
        </button>
      </li>
    </ul>
  </aside>
</template>
