<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  value: string | number
  icon?: string
  change?: string
  changeUp?: boolean
}>(), {
  icon: '',
  change: '',
  changeUp: true,
})
</script>

<template>
  <div class="tail-stat-card">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="tail-stat-label">{{ label }}</p>
        <p class="tail-stat-value mt-1">{{ value }}</p>
        <p v-if="change" class="mt-1" :class="changeUp ? 'tail-stat-change-up' : 'tail-stat-change-down'">
          {{ change }}
        </p>
      </div>
      <div v-if="icon" class="tail-icon-wrap tail-icon-wrap-sm shrink-0">
        <AppIcon :name="icon" size="sm" />
      </div>
    </div>
  </div>
</template>
