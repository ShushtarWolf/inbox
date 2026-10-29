<script setup lang="ts">
/**
 * Material Symbols ligature icon.
 * HTML SoT uses Tabler (`ti-*`) — map closest Material glyphs for chrome; do not use
 * emoji as a permanent stand-in. Rebuild subset via `npm run fonts:icons`.
 * Auth welcome hand uses `AuthHandStopIcon` (SVG) — never rely on missing ligatures.
 */
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

/** Prefer the SoT glyph (same paths the HTML reference injects for `i.ti`). */
const sot = computed(() => (props.filled ? undefined : SOT_ICONS[props.name]))
const mirrored = computed(() => props.name === 'logout' || props.name === 'login')
</script>

<template>
  <span
    v-if="sot"
    class="app-icon-sot"
    :class="[sizeClass, mirrored ? 'app-icon-sot--mirror' : '']"
    aria-hidden="true"
  >
    <svg v-if="sot.m" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path :d="sot.m" /></svg>
    <!-- eslint-disable-next-line vue/no-v-html -->
    <svg v-else viewBox="0 0 24 24" :fill="sot.f ? 'currentColor' : 'none'" :stroke="sot.f ? 'none' : 'currentColor'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="sot.p" />
  </span>
  <span
    v-else
    class="material-symbols-rounded"
    :class="[sizeClass, filled ? 'filled' : '']"
    aria-hidden="true"
  >{{ name }}</span>
</template>

<style scoped>
/* SoT `.ti`: inline-flex, centered, line-height 1, svg 1em. */
.app-icon-sot { display: inline-flex; align-items: center; justify-content: center; line-height: 1; width: 1em; height: 1em; flex-shrink: 0; vertical-align: middle; }
.app-icon-sot svg { width: 1em; height: 1em; display: block; }
.app-icon-sot--mirror svg { transform: scaleX(-1); }
</style>
