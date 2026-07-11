<script setup lang="ts">
defineProps<{
  label: string
  hint?: string
  required?: boolean
}>()
</script>

<template>
  <label class="neo-form-field block text-sm">
    <span class="mb-1 block text-xs font-bold text-brand-gray-600">
      {{ label }}
      <span v-if="required" class="text-brand-primary">*</span>
    </span>
    <slot />
    <span v-if="hint" class="mt-1 block text-xs text-brand-gray-600">{{ hint }}</span>
  </label>
</template>
