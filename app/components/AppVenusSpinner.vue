<script setup lang="ts">
withDefaults(defineProps<{
  size?: 'sm' | 'md' | 'lg'
  label?: string
}>(), {
  size: 'md',
  label: '',
})
</script>

<template>
  <div class="venus-loading-block" role="status" aria-live="polite">
    <span
      class="venus-spinner"
      :class="{
        'venus-spinner-sm': size === 'sm',
        'venus-spinner-lg': size === 'lg',
      }"
      aria-hidden="true"
    />
    <p v-if="label" class="venus-loading-label">{{ label }}</p>
    <slot />
  </div>
</template>
