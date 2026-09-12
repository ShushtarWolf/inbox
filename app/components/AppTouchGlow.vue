<script setup lang="ts">
type TouchPoint = {
  id: number
  x: number
  y: number
  targetX: number
  targetY: number
  opacity: number
  active: boolean
}

type ReleaseBloom = {
  id: number
  x: number
  y: number
}

const points = ref<TouchPoint[]>([])
const blooms = ref<ReleaseBloom[]>([])

let animationFrame = 0
let releaseId = 0
let bloomId = 0
let highlightedElement: HTMLElement | null = null
let highlightTimer: ReturnType<typeof setTimeout> | undefined

const surfaceSelector = [
  '[data-manus-surface]',
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

function isTouchPointer(event: PointerEvent) {
  return event.pointerType === 'touch' || event.pointerType === 'pen'
}

function getSurface(target: EventTarget | null, x: number, y: number) {
  const pointTarget = document.elementFromPoint(x, y) || target
  if (!(pointTarget instanceof Element)) return null
  return pointTarget.closest<HTMLElement>(surfaceSelector)
}

function illuminateSurface(target: EventTarget | null, x: number, y: number) {
  const surface = getSurface(target, x, y)
  if (!surface) return

  const bounds = surface.getBoundingClientRect()
  const highlightX = `${Math.max(0, Math.min(100, ((x - bounds.left) / Math.max(bounds.width, 1)) * 100))}%`
  const highlightY = `${Math.max(0, Math.min(100, ((y - bounds.top) / Math.max(bounds.height, 1)) * 100))}%`
  surface.style.setProperty('--touch-highlight-x', highlightX)
  surface.style.setProperty('--touch-highlight-y', highlightY)
  if (surface === highlightedElement) return

  highlightedElement?.classList.remove('touch-highlight')
  if (highlightTimer) clearTimeout(highlightTimer)

  highlightedElement = surface
  surface.classList.add('touch-highlight')
  highlightTimer = setTimeout(() => {
    surface.classList.remove('touch-highlight')
    if (highlightedElement === surface) highlightedElement = null
  }, 700)
}

function removePoint(id: number) {
  const index = points.value.findIndex((point) => point.id === id)
  if (index < 0 || !points.value[index]) return
  const point = points.value[index]
  point.active = false
  const currentBloomId = ++bloomId
  blooms.value.push({ id: currentBloomId, x: point.targetX, y: point.targetY })
  window.setTimeout(() => {
    blooms.value = blooms.value.filter((bloom) => bloom.id !== currentBloomId)
  }, 440)
  window.setTimeout(() => {
    points.value = points.value.filter((activePoint) => activePoint.id !== id)
  }, 210)
}

function animate() {
  for (const point of points.value) {
    point.x += (point.targetX - point.x) * 0.22
    point.y += (point.targetY - point.y) * 0.22
    point.opacity += ((point.active ? 1 : 0) - point.opacity) * 0.2
  }
  animationFrame = window.requestAnimationFrame(animate)
}

function onPointerDown(event: PointerEvent) {
  if (!isTouchPointer(event)) return
  const existing = points.value.find((point) => point.id === event.pointerId)
  if (existing) return

  points.value.push({
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    targetX: event.clientX,
    targetY: event.clientY,
    opacity: 0,
    active: true,
  })
  illuminateSurface(event.target, event.clientX, event.clientY)
}

function onPointerMove(event: PointerEvent) {
  if (!isTouchPointer(event)) return
  const point = points.value.find((candidate) => candidate.id === event.pointerId)
  if (!point || !point.active) return
  point.targetX = event.clientX
  point.targetY = event.clientY
  illuminateSurface(event.target, event.clientX, event.clientY)
}

function onPointerEnd(event: PointerEvent) {
  if (!isTouchPointer(event)) return
  removePoint(event.pointerId)
}

onMounted(() => {
  animationFrame = window.requestAnimationFrame(animate)
  window.addEventListener('pointerdown', onPointerDown, { passive: true })
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerup', onPointerEnd, { passive: true })
  window.addEventListener('pointercancel', onPointerEnd, { passive: true })
})

onBeforeUnmount(() => {
  window.cancelAnimationFrame(animationFrame)
  window.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerEnd)
  window.removeEventListener('pointercancel', onPointerEnd)
  highlightedElement?.classList.remove('touch-highlight')
  if (highlightTimer) clearTimeout(highlightTimer)
})
</script>

<template>
  <span
    v-for="point in points"
    :key="point.id"
    class="touch-light"
    :class="{ 'touch-light--active': point.active }"
    :style="{
      left: `${point.x}px`,
      top: `${point.y}px`,
      opacity: point.opacity,
    }"
    aria-hidden="true"
  >
    <span class="touch-light__trail touch-light__trail--far" />
    <span class="touch-light__trail touch-light__trail--near" />
    <span class="touch-light__halo" />
    <span class="touch-light__core" />
  </span>
  <span
    v-for="bloom in blooms"
    :key="bloom.id"
    class="touch-release-bloom"
    :style="{ left: `${bloom.x}px`, top: `${bloom.y}px` }"
    aria-hidden="true"
  />
</template>

<style scoped>
.touch-light,
.touch-release-bloom {
  position: fixed;
  z-index: 2147483647;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.touch-light {
  width: 1px;
  height: 1px;
  will-change: left, top, opacity;
}

.touch-light__halo,
.touch-light__core,
.touch-light__trail {
  position: absolute;
  border-radius: 999px;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.touch-light__halo {
  width: 8rem;
  height: 8rem;
  background: radial-gradient(circle, rgb(255 255 255 / 0.28) 0%, rgb(235 240 246 / 0.16) 34%, rgb(235 240 246 / 0) 72%);
  filter: blur(7px);
}

.touch-light__core {
  width: 3rem;
  height: 3rem;
  background: radial-gradient(circle, rgb(255 255 255 / 0.74) 0%, rgb(255 255 255 / 0.36) 28%, rgb(255 255 255 / 0) 72%);
  filter: blur(2px);
}

.touch-light__trail {
  width: 4.5rem;
  height: 4.5rem;
  background: radial-gradient(circle, rgb(240 244 248 / 0.18) 0%, rgb(240 244 248 / 0) 70%);
  filter: blur(5px);
  opacity: 0.6;
}

.touch-light__trail--near {
  transform: translate(-68%, -68%) scale(0.76);
  opacity: 0.52;
}

.touch-light__trail--far {
  transform: translate(-84%, -84%) scale(0.58);
  opacity: 0.28;
}

.touch-release-bloom {
  width: 2rem;
  height: 2rem;
  border: 1px solid rgb(255 255 255 / 0.62);
  border-radius: 999px;
  box-shadow: 0 0 18px rgb(226 233 241 / 0.3);
  animation: touch-release 420ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

@keyframes touch-release {
  from {
    opacity: 0.62;
    transform: translate(-50%, -50%) scale(0.35);
  }
  to {
    opacity: 0;
    transform: translate(-50%, -50%) scale(2.4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .touch-release-bloom {
    animation-duration: 180ms;
  }
}
</style>

<style>
.touch-highlight {
  --touch-highlight-x: 50%;
  --touch-highlight-y: 50%;
  position: relative;
  outline: 1px solid rgb(255 255 255 / 0.68);
  outline-offset: 2px;
  border-radius: inherit;
  background-image: radial-gradient(circle at var(--touch-highlight-x) var(--touch-highlight-y), rgb(255 255 255 / 0.16), transparent 46%);
  box-shadow: 0 0 0 4px rgb(255 255 255 / 0.12), 0 0 24px rgb(220 228 237 / 0.3);
  transition: outline 140ms ease-out, box-shadow 180ms ease-out, background-image 180ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .touch-highlight {
    transition: none;
  }
}
</style>
