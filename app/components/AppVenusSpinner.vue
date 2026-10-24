<script setup lang="ts">
withDefaults(defineProps<{
  size?: 'sm' | 'md' | 'lg'
  label?: string
  /** Tighter padding for overlays, dropdowns, and inline sections. */
  compact?: boolean
  /** Optional override for loader color (e.g. on dark scrims). */
  color?: string
}>(), {
  size: 'md',
  label: '',
  compact: false,
  color: undefined,
})
</script>

<template>
  <AppInboxLoader
    :size="size"
    :label="label"
    :compact="compact"
    :color="color"
  />
</template>
