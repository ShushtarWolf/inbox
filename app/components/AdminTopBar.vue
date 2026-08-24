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
    <div class="mx-auto flex w-full max-w-none items-center justify-between gap-3 px-4 py-2.5 min-[431px]:px-8 min-[431px]:py-3">
      <p class="min-w-0 flex-1 text-start text-sm font-bold leading-snug text-brand-navy min-[431px]:text-base">
        {{ title }}
      </p>
      <button
        type="button"
        class="inline-flex shrink-0 items-center justify-center border border-brand-gray-200 bg-white text-brand-navy transition hover:border-brand-primary/40 max-[430px]:h-9 max-[430px]:w-9 min-[431px]:gap-1.5 min-[431px]:px-3 min-[431px]:py-2 min-[431px]:text-xs min-[431px]:font-bold"
        style="border-radius: 2px;"
        :aria-label="lockLabel"
        @click="emit('lock')"
      >
        <AppIcon name="logout" size="sm" />
        <span class="hidden min-[431px]:inline">{{ lockLabel }}</span>
      </button>
    </div>
  </header>
</template>
