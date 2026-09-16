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
    <div
      class="venus-fold-spinner"
      :class="{
        'venus-fold-spinner-sm': size === 'sm',
        'venus-fold-spinner-lg': size === 'lg',
      }"
      aria-hidden="true"
    >
      <div class="venus-fold-spinner__grid">
        <div v-for="i in 9" :key="i" class="venus-fold-spinner__cube" />
      </div>
    </div>
    <p v-if="label" class="venus-loading-label">{{ label }}</p>
    <slot />
  </div>
</template>
