<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  body?: string
  icon?: string
  /** Brand doodle illustration instead of a material icon. */
  doodle?: 'bench' | 'seat' | 'recline' | null
}>(), {
  body: '',
  icon: 'inbox',
  doodle: null,
})

const doodleSrc: Record<string, string> = {
  bench: '/brand/inbox-icon-bench.svg',
  seat: '/brand/inbox-icon-seat.svg',
  recline: '/brand/inbox-icon-recline.svg',
}
</script>

<template>
  <div class="canva-empty-state">
    <span class="canva-empty-state-icon">
      <img v-if="doodle" :src="doodleSrc[doodle]" alt="" />
      <AppIcon v-else :name="icon" size="lg" />
    </span>
    <p class="relative z-[1] text-sm font-bold text-brand-navy">{{ title }}</p>
    <p v-if="body" class="relative z-[1] max-w-xs text-xs text-brand-gray-500">{{ body }}</p>
    <div v-if="$slots.default" class="relative z-[1] mt-1">
      <slot />
    </div>
  </div>
</template>
