<script setup lang="ts">
const props = withDefaults(defineProps<{
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  filled?: boolean
}>(), {
  size: 'md',
  filled: false,
})

const sizeClass = computed(() => {
  if (props.size === 'sm') return 'text-base'
  if (props.size === 'lg') return 'text-2xl'
  if (props.size === 'xl') return 'text-3xl'
  return 'text-xl'
})
</script>

<template>
  <span
    class="material-symbols-rounded"
    :class="[sizeClass, filled ? 'filled' : '']"
    aria-hidden="true"
  >{{ name }}</span>
</template>
