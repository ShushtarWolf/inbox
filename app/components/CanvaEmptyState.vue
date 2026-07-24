<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  body?: string
  icon?: string
}>(), {
  body: '',
  icon: 'inbox',
})
</script>

<template>
  <div class="canva-empty-state">
    <span class="canva-empty-state-icon">
      <AppIcon :name="icon" size="lg" />
    </span>
    <p class="text-sm font-bold text-brand-navy">{{ title }}</p>
    <p v-if="body" class="max-w-xs text-xs text-brand-gray-500">{{ body }}</p>
    <div v-if="$slots.default" class="mt-1">
      <slot />
    </div>
  </div>
</template>
