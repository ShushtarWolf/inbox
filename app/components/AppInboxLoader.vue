<script setup lang="ts">
const props = withDefaults(defineProps<{
  size?: 'sm' | 'md' | 'lg'
  /** Loader stroke/fill color (default brand crimson). */
  color?: string
  /** Animation cycle length in seconds. */
  durationSec?: number
  label?: string
  compact?: boolean
}>(), {
  size: 'md',
  color: '#C41E1E',
  durationSec: 3,
  label: '',
  compact: false,
})

const px = computed(() => {
  if (props.size === 'sm') return 28
  if (props.size === 'lg') return 96
  return 64
})
</script>

<template>
  <div
    class="inbox-loading-block"
    :class="{ 'inbox-loading-block-compact': compact || size === 'sm' }"
    role="status"
    aria-live="polite"
  >
    <svg
      class="inbox-loader"
      :style="{ '--il-c': color, '--il-d': `${durationSec}s`, width: `${px}px`, height: `${px}px` }"
      viewBox="-90 -90 1180 1180"
      role="img"
      :aria-label="label || undefined"
    >
      <g class="inbox-loader__box">
        <g class="inbox-loader__tray">
          <path class="inbox-loader__path" d="M-250.76 125V-125H250.76V125" />
        </g>
        <g class="inbox-loader__ball">
          <circle class="inbox-loader__ball-fill" r="93.533" />
        </g>
        <g class="inbox-loader__lid">
          <path class="inbox-loader__path" d="M-250.76 125V-125H250.76V125" />
        </g>
      </g>
    </svg>
    <p v-if="label" class="inbox-loading-label">{{ label }}</p>
    <slot />
  </div>
</template>
