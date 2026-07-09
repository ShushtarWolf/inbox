<script setup lang="ts">
const model = defineModel<string>({ required: true })

const props = withDefaults(defineProps<{
  label?: string
  showFormattedHint?: boolean
}>(), {
  showFormattedHint: true,
})

const { t } = useI18n()
const { formatDate } = useFormatters()

const formattedHint = computed(() => {
  if (!props.showFormattedHint || !model.value) return ''
  return formatDate(`${model.value}T12:00:00`)
})
</script>

<template>
  <label class="block space-y-1">
    <span v-if="label || $slots.label" class="text-sm font-bold text-brand-gray-600">
      <slot name="label">{{ label || t('common.date') }}</slot>
    </span>
    <input
      v-model="model"
      type="date"
      dir="ltr"
      class="w-full rounded-xl border border-black/10 px-3 py-2 tabular-nums"
    >
    <p v-if="formattedHint" class="text-xs text-brand-gray-600" dir="auto">{{ formattedHint }}</p>
  </label>
</template>
