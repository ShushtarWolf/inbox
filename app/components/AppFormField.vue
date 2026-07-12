<script setup lang="ts">
const props = defineProps<{
  label: string
  hint?: string
  required?: boolean
  fieldId?: string
}>()

const labelId = computed(() => (props.fieldId ? `${props.fieldId}-label` : undefined))
</script>

<template>
  <div class="neo-form-field block text-sm" role="group" :aria-labelledby="labelId">
    <span :id="labelId" class="mb-1 block text-xs font-bold text-brand-gray-600">
      {{ label }}
      <span v-if="required" class="text-brand-primary" aria-hidden="true">*</span>
      <span v-if="required" class="sr-only">{{ $t('common.required') }}</span>
    </span>
    <slot />
    <span v-if="hint" class="mt-1 block text-xs text-brand-gray-600">{{ hint }}</span>
  </div>
</template>
