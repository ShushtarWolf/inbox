<script setup lang="ts">
const props = defineProps<{
  modelValue: string[]
  options: Array<{ id: string; label: string }>
  ariaLabelledby?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

function toggle(id: string) {
  const next = new Set(props.modelValue)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  emit('update:modelValue', [...next])
}
</script>

<template>
  <div class="neo-equipment-picker" :aria-labelledby="ariaLabelledby">
    <label
      v-for="option in options"
      :key="option.id"
      class="neo-equipment-option"
    >
      <input
        type="checkbox"
        class="rounded border-brand-gray-300 text-brand-primary focus:ring-brand-primary"
        :checked="modelValue.includes(option.id)"
        :aria-label="option.label"
        @change="toggle(option.id)"
      >
      <span>{{ option.label }}</span>
    </label>
    <p v-if="!options.length" class="px-3 py-2 text-xs text-brand-gray-600">
      {{ $t('common.empty') }}
    </p>
  </div>
</template>
