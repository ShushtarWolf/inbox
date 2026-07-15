<script setup lang="ts">
const props = defineProps<{
  label: string
  hint?: string
  required?: boolean
  fieldId?: string
}>()

const resolvedId = computed(() => props.fieldId || undefined)
const labelId = computed(() => (resolvedId.value ? `${resolvedId.value}-label` : undefined))
</script>

<template>
  <div class="neo-form-field block text-sm" role="group" :aria-labelledby="labelId">
    <label
      :id="labelId"
      :for="resolvedId"
      class="mb-1 block text-xs font-bold text-brand-gray-600"
    >
      {{ label }}
      <span v-if="required" class="text-brand-primary" aria-hidden="true">*</span>
      <span v-if="required" class="sr-only">{{ $t('common.required') }}</span>
    </label>
    <slot />
    <span v-if="hint" class="mt-1 block text-xs text-brand-gray-600">{{ hint }}</span>
  </div>
</template>
