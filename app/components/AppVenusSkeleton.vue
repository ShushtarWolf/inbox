<script setup lang="ts">
withDefaults(defineProps<{
  lines?: number
  showCard?: boolean
}>(), {
  lines: 3,
  showCard: true,
})
</script>

<template>
  <div
    class="space-y-3"
    :class="showCard ? 'ios-card p-5' : ''"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div class="venus-skeleton h-5 w-2/5" />
    <div
      v-for="index in lines"
      :key="index"
      class="venus-skeleton h-4"
      :class="index === lines ? 'w-3/5' : 'w-full'"
    />
    <div class="venus-skeleton mt-2 h-10 w-full rounded-venus" />
  </div>
</template>
