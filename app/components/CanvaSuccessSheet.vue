<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  body?: string
  ctaLabel?: string
}>(), {
  body: '',
  ctaLabel: '',
})

const emit = defineEmits<{
  cta: []
}>()
</script>

<template>
  <div class="canva-result-sheet p-6 text-center">
    <span class="relative z-[1] mx-auto flex h-16 w-16 items-center justify-center bg-emerald-50 text-emerald-600" style="border-radius: var(--sz-canva-radius);">
      <AppIcon name="check_circle" size="xl" filled />
    </span>
    <h2 class="relative z-[1] mt-4 font-display text-lg font-bold text-brand-navy">{{ title }}</h2>
    <p v-if="body" class="relative z-[1] mt-2 text-sm text-brand-gray-600">{{ body }}</p>
    <div class="relative z-[1] mt-5">
      <slot name="cta">
        <button v-if="ctaLabel" type="button" class="canva-gate-btn-primary w-full" @click="emit('cta')">{{ ctaLabel }}</button>
      </slot>
    </div>
  </div>
</template>
