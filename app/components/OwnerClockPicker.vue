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
  <aside class="rounded-xl border border-black/5 bg-white p-4 shadow-card">
    <h3 class="mb-3 text-sm font-bold text-brand-gray-700">{{ t('owner.clockSelector') }}</h3>
    <ul class="space-y-1">
      <li v-for="time in options" :key="time">
        <button
          type="button"
          class="block w-full rounded-lg px-3 py-2 text-start text-sm font-semibold transition"
          :class="selected === time ? 'bg-brand-primary text-white' : 'text-brand-gray-700 hover:bg-brand-cream'"
          @click="selectTime(time)"
        >
          <bdi dir="ltr" class="tabular-nums">{{ time }}</bdi>
        </button>
      </li>
    </ul>
  </aside>
</template>
