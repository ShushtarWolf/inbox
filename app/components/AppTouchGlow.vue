<script setup lang="ts">
const visible = ref(false)
const x = ref(0)
const y = ref(0)
let hideTimer: ReturnType<typeof setTimeout> | undefined

function showGlow(event: PointerEvent) {
  // Keep desktop mouse clicks unchanged; this is intended for touch/stylus feedback.
  if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return

  x.value = event.clientX
  y.value = event.clientY
  visible.value = true

  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    visible.value = false
  }, 520)
}

function hideGlow() {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    visible.value = false
  }, 180)
}

onMounted(() => {
  window.addEventListener('pointerdown', showGlow, { passive: true })
  window.addEventListener('pointerup', hideGlow, { passive: true })
  window.addEventListener('pointercancel', hideGlow, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', showGlow)
  window.removeEventListener('pointerup', hideGlow)
  window.removeEventListener('pointercancel', hideGlow)
  if (hideTimer) clearTimeout(hideTimer)
})
</script>

<template>
  <span
    class="touch-glow"
    :class="{ 'touch-glow--visible': visible }"
    :style="{ left: `${x}px`, top: `${y}px` }"
    aria-hidden="true"
  />
</template>

<style scoped>
.touch-glow {
  position: fixed;
  z-index: 2147483647;
  width: 5.5rem;
  height: 5.5rem;
  border-radius: 999px;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.52);
  background: radial-gradient(
    circle,
    rgb(255 255 255 / 0.62) 0%,
    rgb(255 255 255 / 0.32) 18%,
    rgb(196 30 30 / 0.18) 42%,
    rgb(196 30 30 / 0) 72%
  );
  filter: blur(1px);
  transition: opacity 180ms ease-out, transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: left, top, opacity, transform;
}

.touch-glow--visible {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

@media (prefers-reduced-motion: reduce) {
  .touch-glow {
    transition: opacity 120ms linear;
  }
}
</style>
