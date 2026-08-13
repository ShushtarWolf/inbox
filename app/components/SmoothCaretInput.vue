<script setup lang="ts">
/**
 * Skiper106-inspired smooth caret — Vue port (no React/Framer).
 * Real <input>/<textarea> stays in the DOM; custom caret overlays via spring + mirror measure.
 * Auth LTR fields are primary; RTL multiline uses the same mirror so Persian contact works.
 */
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    modelValue?: string
    /** Render textarea instead of input */
    multiline?: boolean
    rows?: number
    type?: string
    class?: string
  }>(),
  {
    modelValue: '',
    multiline: false,
    rows: 4,
    type: 'text',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const attrs = useAttrs()
const controlRef = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)
const wrapRef = ref<HTMLElement | null>(null)
const measureRef = ref<HTMLElement | null>(null)
const markerRef = ref<HTMLElement | null>(null)

const focused = ref(false)
const showCaret = ref(false)
const caretLeft = ref(0)
const caretTop = ref(0)
const caretHeight = ref(18)
const springX = ref(0)
const springY = ref(0)
const velX = ref(0)
const velY = ref(0)
const measureBefore = ref('')

let rafId = 0
let reduceMotion = false
let resizeObserver: ResizeObserver | null = null
let mq: MediaQueryList | null = null

const isPassword = computed(() => !props.multiline && props.type === 'password')

const controlClass = computed(() => {
  const base = props.multiline
    ? 'neo-textarea bg-white/95 smooth-caret-control'
    : 'neo-input bg-white/95 smooth-caret-control'
  return [base, props.class].filter(Boolean)
})

const forwarded = computed(() => {
  const { class: _c, ...rest } = attrs as Record<string, unknown>
  return rest
})

function prefersReducedMotion() {
  if (!import.meta.client) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function passwordBullet() {
  return '\u2022'
}

function syncMeasureStyles() {
  const el = controlRef.value
  const measure = measureRef.value
  if (!el || !measure) return
  const cs = getComputedStyle(el)
  measure.style.font = cs.font
  measure.style.fontSize = cs.fontSize
  measure.style.fontFamily = cs.fontFamily
  measure.style.fontWeight = cs.fontWeight
  measure.style.fontStyle = cs.fontStyle
  measure.style.letterSpacing = cs.letterSpacing
  measure.style.lineHeight = cs.lineHeight
  measure.style.textTransform = cs.textTransform
  measure.style.textAlign = cs.textAlign
  measure.style.direction = cs.direction
  measure.style.paddingTop = cs.paddingTop
  measure.style.paddingRight = cs.paddingRight
  measure.style.paddingBottom = cs.paddingBottom
  measure.style.paddingLeft = cs.paddingLeft
  measure.style.borderTopWidth = cs.borderTopWidth
  measure.style.borderRightWidth = cs.borderRightWidth
  measure.style.borderBottomWidth = cs.borderBottomWidth
  measure.style.borderLeftWidth = cs.borderLeftWidth
  measure.style.borderStyle = 'solid'
  measure.style.borderColor = 'transparent'
  measure.style.boxSizing = cs.boxSizing
  measure.style.width = `${el.offsetWidth}px`
  measure.style.height = `${el.offsetHeight}px`
  if (props.multiline) {
    measure.style.whiteSpace = 'pre-wrap'
    measure.style.wordWrap = 'break-word'
    measure.style.overflowWrap = 'break-word'
  } else {
    measure.style.whiteSpace = 'pre'
  }
}

function textBeforeCaret(): string {
  const el = controlRef.value
  if (!el) return ''
  const value = el.value
  const start = el.selectionStart ?? value.length
  const before = value.slice(0, start)
  if (isPassword.value) return passwordBullet().repeat(before.length)
  return before
}

function updateCaretTarget(snap = false) {
  const el = controlRef.value
  const wrap = wrapRef.value
  const measure = measureRef.value
  const marker = markerRef.value
  if (!el || !wrap || !measure || !marker) return

  const start = el.selectionStart
  const end = el.selectionEnd
  const collapsed = start != null && end != null && start === end
  const shouldShow = focused.value && collapsed && !el.readOnly && !el.disabled

  if (!shouldShow || reduceMotion) {
    showCaret.value = false
    el.style.caretColor = ''
    return
  }

  el.style.caretColor = 'transparent'
  syncMeasureStyles()
  measureBefore.value = textBeforeCaret()

  nextTick(() => {
    measure.scrollLeft = el.scrollLeft
    measure.scrollTop = el.scrollTop

    const wrapBox = wrap.getBoundingClientRect()
    const markBox = marker.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const fontSize = Number.parseFloat(cs.fontSize) || 14
    const lineH = Number.parseFloat(cs.lineHeight)
    const height = Number.isFinite(lineH) ? lineH : fontSize * 1.25

    caretLeft.value = markBox.left - wrapBox.left
    caretTop.value = markBox.top - wrapBox.top
    caretHeight.value = Math.max(14, Math.min(height, el.clientHeight - 4))
    showCaret.value = true

    if (snap) {
      springX.value = caretLeft.value
      springY.value = caretTop.value
      velX.value = 0
      velY.value = 0
    } else {
      kickSpring()
    }
  })
}

function springTick() {
  if (!showCaret.value) {
    rafId = 0
    return
  }
  const stiffness = 380
  const damping = 26
  const dt = 1 / 60
  const dx = caretLeft.value - springX.value
  const dy = caretTop.value - springY.value
  velX.value += dx * stiffness * dt
  velY.value += dy * stiffness * dt
  velX.value *= Math.exp(-damping * dt)
  velY.value *= Math.exp(-damping * dt)
  springX.value += velX.value * dt
  springY.value += velY.value * dt

  if (
    Math.abs(dx) < 0.2
    && Math.abs(dy) < 0.2
    && Math.abs(velX.value) < 0.4
    && Math.abs(velY.value) < 0.4
  ) {
    springX.value = caretLeft.value
    springY.value = caretTop.value
    velX.value = 0
    velY.value = 0
    rafId = 0
    return
  }
  rafId = requestAnimationFrame(springTick)
}

function kickSpring() {
  if (reduceMotion || !showCaret.value) return
  if (!rafId) rafId = requestAnimationFrame(springTick)
}

function onInput(e: Event) {
  const target = e.target as HTMLInputElement | HTMLTextAreaElement
  emit('update:modelValue', target.value)
  nextTick(() => updateCaretTarget())
}

function onFocus() {
  focused.value = true
  nextTick(() => updateCaretTarget(true))
}

function onBlur() {
  focused.value = false
  showCaret.value = false
  if (controlRef.value) controlRef.value.style.caretColor = ''
}

function onSelectOrKey() {
  nextTick(() => updateCaretTarget())
}

function onScroll() {
  updateCaretTarget(true)
}

function onSelectionChange() {
  if (!focused.value) return
  updateCaretTarget()
}

watch(
  () => props.modelValue,
  (v) => {
    if (!controlRef.value) return
    if (controlRef.value.value !== (v ?? '')) {
      controlRef.value.value = v ?? ''
    }
    if (focused.value) nextTick(() => updateCaretTarget())
  },
)

function onMqChange() {
  reduceMotion = prefersReducedMotion()
  updateCaretTarget(true)
}

onMounted(() => {
  reduceMotion = prefersReducedMotion()
  mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener('change', onMqChange)
  document.addEventListener('selectionchange', onSelectionChange)
  if (controlRef.value) {
    resizeObserver = new ResizeObserver(() => updateCaretTarget(true))
    resizeObserver.observe(controlRef.value)
  }
})

onBeforeUnmount(() => {
  mq?.removeEventListener('change', onMqChange)
  document.removeEventListener('selectionchange', onSelectionChange)
  resizeObserver?.disconnect()
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<template>
  <div ref="wrapRef" class="smooth-caret-wrap">
    <textarea
      v-if="multiline"
      ref="controlRef"
      :value="modelValue"
      :rows="rows"
      :class="controlClass"
      v-bind="forwarded"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keyup="onSelectOrKey"
      @click="onSelectOrKey"
      @select="onSelectOrKey"
      @scroll="onScroll"
    />
    <input
      v-else
      ref="controlRef"
      :value="modelValue"
      :type="type"
      :class="controlClass"
      v-bind="forwarded"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keyup="onSelectOrKey"
      @click="onSelectOrKey"
      @select="onSelectOrKey"
      @scroll="onScroll"
    >

    <div
      ref="measureRef"
      class="smooth-caret-measure"
      aria-hidden="true"
    >
      <span>{{ measureBefore }}</span><span ref="markerRef" class="smooth-caret-marker" />
    </div>

    <span
      v-show="showCaret"
      class="smooth-caret-bar"
      :style="{
        transform: `translate3d(${springX}px, ${springY}px, 0)`,
        height: `${caretHeight}px`,
      }"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.smooth-caret-wrap {
  position: relative;
  width: 100%;
}

.smooth-caret-control {
  position: relative;
  z-index: 1;
  border-radius: var(--sz-canva-radius-max, 2px);
}

.smooth-caret-measure {
  position: absolute;
  inset: 0;
  z-index: 0;
  visibility: hidden;
  pointer-events: none;
  overflow: hidden;
  white-space: pre;
}

.smooth-caret-marker {
  display: inline-block;
  width: 0;
  height: 1em;
  vertical-align: text-bottom;
}

.smooth-caret-bar {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  width: 2px;
  border-radius: 1px;
  background-color: #c41e1e;
  pointer-events: none;
  will-change: transform;
}

@media (prefers-reduced-motion: reduce) {
  .smooth-caret-bar {
    display: none;
  }
}
</style>
