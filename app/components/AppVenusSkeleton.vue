<script setup lang="ts">
withDefaults(defineProps<{
  lines?: number
  showCard?: boolean
  variant?: 'default' | 'table' | 'stat-grid'
}>(), {
  lines: 3,
  showCard: true,
  variant: 'default',
})
</script>

<template>
  <div
    class="space-y-3"
    :class="showCard ? 'tail-card' : ''"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <template v-if="variant === 'stat-grid'">
      <div class="tail-card-grid-4">
        <div v-for="i in 4" :key="i" class="tail-skeleton h-24 rounded-tail" />
      </div>
    </template>
    <template v-else-if="variant === 'table'">
      <div class="tail-skeleton h-6 w-40" />
      <div class="tail-skeleton mt-4 h-10 w-full rounded-lg" />
      <div v-for="i in lines" :key="i" class="tail-skeleton h-12 w-full rounded-lg" />
    </template>
    <template v-else>
      <div class="tail-skeleton h-5 w-2/5" />
      <div
        v-for="index in lines"
        :key="index"
        class="tail-skeleton h-4"
        :class="index === lines ? 'w-3/5' : 'w-full'"
      />
      <div class="tail-skeleton mt-2 h-10 w-full rounded-lg" />
    </template>
  </div>
</template>
