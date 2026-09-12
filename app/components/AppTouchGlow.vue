<script setup lang="ts">
const visible = ref(false)
const x = ref(0)
const y = ref(0)

let activePointerId: number | null = null
let hideTimer: ReturnType<typeof setTimeout> | undefined
let highlightTimer: ReturnType<typeof setTimeout> | undefined
let highlightedElement: HTMLElement | null = null

const highlightSelector = [
  '[role="dialog"]',
  '[class*="modal"]',
  '[class*="sheet"]',
  '[class*="card"]',
  '[class*="dialog"]',
  'button',
  'a',
  '[role="button"]',
  'input',
  'select',
  'textarea',
].join(', ')

function clearHighlight() {
  if (highlightTimer) clearTimeout(highlightTimer)
  highlightedElement?.classList.remove('touch-highlight')
  highlightedElement = null
}

function highlightTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return

  const element = target.closest<HTMLElement>(highlightSelector)
  if (!element || element === highlightedElement) return

  clearHighlight()
  highlightedElement = element
  element.classList.add('touch-highlight')
  highlightTimer = setTimeout(() => {
    element.classList.remove('touch-highlight')
    if (highlightedElement === element) highlightedElement = null
  }, 650)
}

function updateGlow(event: PointerEvent) {
  x.value = event.clientX
  y.value = event.clientY
  visible.value = true
  highlightTarget(document.elementFromPoint(event.clientX, event.clientY) || event.target)
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
  activePointerId = event.pointerId
  if (hideTimer) clearTimeout(hideTimer)
  updateGlow(event)
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerId !== activePointerId) return
  updateGlow(event)
}

function hideGlow(event: PointerEvent) {
  if (event.pointerId !== activePointerId) return
  activePointerId = null
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    visible.value = false
    clearHighlight()
  }, 180)
}

onMounted(() => {
  window.addEventListener('pointerdown', onPointerDown, { passive: true })
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerup', hideGlow, { passive: true })
  window.addEventListener('pointercancel', hideGlow, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', hideGlow)
  window.removeEventListener('pointercancel', hideGlow)
  if (hideTimer) clearTimeout(hideTimer)
  clearHighlight()
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
  width: 7rem;
  height: 7rem;
  border-radius: 999px;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.42);
  background: radial-gradient(
    circle,
    rgb(255 255 255 / 0.64) 0%,
    rgb(255 255 255 / 0.38) 20%,
    rgb(224 229 235 / 0.18) 42%,
    rgb(224 229 235 / 0) 72%
  );
  filter: blur(3px);
  transition: opacity 160ms ease-out, transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
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

<style>
/* Global because the highlighted card/modal is outside this component's scope. */
.touch-highlight {
  outline: 1px solid rgb(255 255 255 / 0.78);
  outline-offset: 2px;
  border-radius: inherit;
  box-shadow: 0 0 0 4px rgb(255 255 255 / 0.18), 0 0 22px rgb(214 221 230 / 0.32);
  transition: outline 140ms ease-out, box-shadow 140ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .touch-highlight {
    transition: none;
  }
}
</style>
