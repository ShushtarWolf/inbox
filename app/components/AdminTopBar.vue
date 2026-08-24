<script setup lang="ts">
defineProps<{
  title: string
  lockLabel: string
}>()

const emit = defineEmits<{
  lock: []
}>()
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-brand-gray-100 bg-brand-cream/95 backdrop-blur">
    <div class="flex items-center justify-between gap-3 px-4 py-2.5 min-[431px]:px-8 min-[431px]:py-3">
      <p class="min-w-0 flex-1 text-start text-sm font-bold leading-snug text-brand-navy min-[431px]:text-base">
        {{ title }}
      </p>
      <button
        type="button"
        class="inline-flex shrink-0 items-center gap-1.5 border border-brand-gray-200 bg-white px-3 py-2 text-xs font-bold text-brand-navy transition hover:border-brand-primary/40"
        style="border-radius: 2px;"
        @click="emit('lock')"
      >
        <AppIcon name="logout" size="sm" />
        {{ lockLabel }}
      </button>
    </div>
  </header>
</template>
