<script setup lang="ts">
/**
 * Material Symbols ligature icon. Some glyphs fail on older subset builds /
 * cached SW fonts — use emoji fallbacks for critical welcome/chrome icons so
 * users never see raw names like "waving_hand".
 */
const EMOJI_FALLBACK: Record<string, string> = {
  waving_hand: '👋',
}

const props = withDefaults(defineProps<{
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  filled?: boolean
}>(), {
  size: 'md',
  filled: false,
})

const sizeClass = computed(() => {
  if (props.size === 'sm') return 'text-base'
  if (props.size === 'lg') return 'text-2xl'
  if (props.size === 'xl') return 'text-3xl'
  return 'text-xl'
})

const emoji = computed(() => EMOJI_FALLBACK[props.name] || '')
</script>

<template>
  <span
    v-if="emoji"
    class="inline-block leading-none"
    :class="sizeClass"
    aria-hidden="true"
  >{{ emoji }}</span>
  <span
    v-else
    class="material-symbols-rounded"
    :class="[sizeClass, filled ? 'filled' : '']"
    aria-hidden="true"
  >{{ name }}</span>
</template>
