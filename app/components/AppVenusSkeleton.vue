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
    :class="showCard && variant === 'default' ? 'tail-card' : ''"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <!-- Athlete home / dashboards: search row + venue tile rails -->
    <template v-if="variant === 'stat-grid'">
      <div class="tail-skeleton h-14 w-full rounded-[2px]" />
      <div class="space-y-2">
        <div class="tail-skeleton h-4 w-28" />
        <div class="grid grid-cols-3 gap-2">
          <div v-for="i in 3" :key="`rail-a-${i}`" class="tail-skeleton aspect-square w-full rounded-[2px]" />
        </div>
      </div>
      <div class="space-y-2">
        <div class="tail-skeleton h-4 w-24" />
        <div class="grid grid-cols-3 gap-2">
          <div v-for="i in 3" :key="`rail-b-${i}`" class="tail-skeleton aspect-square w-full rounded-[2px]" />
        </div>
      </div>
      <div class="space-y-2">
        <div class="tail-skeleton h-4 w-32" />
        <div class="grid grid-cols-3 gap-2">
          <div v-for="i in 3" :key="`rail-c-${i}`" class="tail-skeleton aspect-square w-full rounded-[2px]" />
        </div>
      </div>
    </template>
    <!-- Coaches / clubs lists -->
    <template v-else-if="variant === 'table'">
      <div
        v-for="i in Math.max(lines, 4)"
        :key="i"
        class="tail-card flex items-center gap-3 p-3"
      >
        <div class="tail-skeleton h-14 w-14 shrink-0 rounded-[2px]" />
        <div class="min-w-0 flex-1 space-y-2">
          <div class="tail-skeleton h-4 w-2/5" />
          <div class="tail-skeleton h-3 w-3/5" />
          <div class="tail-skeleton h-3 w-1/3" />
        </div>
      </div>
    </template>
    <!-- Settings / forms: stacked panels -->
    <template v-else>
      <div v-for="panel in 4" :key="panel" class="tail-card space-y-3 p-5">
        <div class="tail-skeleton h-5 w-1/3" />
        <div class="tail-skeleton h-10 w-full rounded-[2px]" />
        <div class="tail-skeleton h-10 w-full rounded-[2px]" />
        <div class="tail-skeleton h-10 w-4/5 rounded-[2px]" />
      </div>
    </template>
  </div>
</template>
