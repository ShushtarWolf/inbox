<script setup lang="ts">
/**
 * Telegram-style circular avatar crop: drag to pan, slider to zoom, confirm exports a square JPEG.
 */
const props = defineProps<{
  open: boolean
  /** Object URL or data URL of the source image. */
  sourceUrl: string
}>()

const emit = defineEmits<{
  close: []
  confirm: [file: File]
}>()

const { t } = useI18n()

const STAGE = 280
const OUTPUT = 512
const MIN_ZOOM = 1
const MAX_ZOOM = 3

const img = ref<HTMLImageElement | null>(null)
const naturalW = ref(0)
const naturalH = ref(0)
const zoom = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const dragging = ref(false)
const lastX = ref(0)
const lastY = ref(0)
const exporting = ref(false)

const baseScale = computed(() => {
  if (!naturalW.value || !naturalH.value) return 1
  // Cover the circular stage (diameter = STAGE)
  return Math.max(STAGE / naturalW.value, STAGE / naturalH.value)
})

const displayW = computed(() => naturalW.value * baseScale.value * zoom.value)
const displayH = computed(() => naturalH.value * baseScale.value * zoom.value)

const imgStyle = computed(() => ({
  width: `${displayW.value}px`,
  height: `${displayH.value}px`,
  transform: `translate(calc(-50% + ${offsetX.value}px), calc(-50% + ${offsetY.value}px))`,
}))

function clampOffsets() {
  const maxX = Math.max(0, (displayW.value - STAGE) / 2)
  const maxY = Math.max(0, (displayH.value - STAGE) / 2)
  offsetX.value = Math.min(maxX, Math.max(-maxX, offsetX.value))
  offsetY.value = Math.min(maxY, Math.max(-maxY, offsetY.value))
}

function resetView() {
  zoom.value = 1
  offsetX.value = 0
  offsetY.value = 0
}

function onImageLoad(event: Event) {
  const el = event.target as HTMLImageElement
  naturalW.value = el.naturalWidth
  naturalH.value = el.naturalHeight
  img.value = el
  resetView()
}

watch(() => props.sourceUrl, () => {
  naturalW.value = 0
  naturalH.value = 0
  resetView()
})

watch(zoom, () => {
  nextTick(clampOffsets)
})

function onPointerDown(event: PointerEvent) {
  dragging.value = true
  lastX.value = event.clientX
  lastY.value = event.clientY
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  offsetX.value += event.clientX - lastX.value
  offsetY.value += event.clientY - lastY.value
  lastX.value = event.clientX
  lastY.value = event.clientY
  clampOffsets()
}

function onPointerUp() {
  dragging.value = false
}

async function confirmCrop() {
  if (!naturalW.value || exporting.value) return
  exporting.value = true
  try {
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT
    canvas.height = OUTPUT
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')

    // Image center sits at (STAGE/2 + offset). Stage crop center is (STAGE/2, STAGE/2).
    const scale = baseScale.value * zoom.value
    const srcCenterX = naturalW.value / 2 - offsetX.value / scale
    const srcCenterY = naturalH.value / 2 - offsetY.value / scale
    const srcSize = STAGE / scale

    const image = img.value
    if (!image) throw new Error('image')

    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, OUTPUT, OUTPUT)
    ctx.drawImage(
      image,
      srcCenterX - srcSize / 2,
      srcCenterY - srcSize / 2,
      srcSize,
      srcSize,
      0,
      0,
      OUTPUT,
      OUTPUT,
    )

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
    })
    if (!blob) throw new Error('blob')
    emit('confirm', new File([blob], 'avatar.jpg', { type: 'image/jpeg', lastModified: Date.now() }))
  } catch {
    emit('close')
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <AppModal
    :open="open"
    sheet
    patterned
    close-icon
    max-width-class="canva-phone-shell max-w-sm"
    :title="t('upload.cropTitle')"
    overlay-class="z-[80]"
    @close="emit('close')"
  >
    <div class="flex flex-col gap-4 px-4 pb-5 pt-1">
      <p class="text-center text-sm text-brand-gray-600">{{ t('upload.cropHint') }}</p>

      <div
        class="avatar-crop-stage relative mx-auto touch-none overflow-hidden bg-[#1a1a18]"
        :style="{ width: `${STAGE}px`, height: `${STAGE}px` }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <img
          v-if="sourceUrl"
          :src="sourceUrl"
          alt=""
          class="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
          :style="imgStyle"
          draggable="false"
          @load="onImageLoad"
        >
        <div class="avatar-crop-mask pointer-events-none absolute inset-0" aria-hidden="true" />
      </div>

      <label class="flex items-center gap-3">
        <span class="shrink-0 text-xs font-bold text-brand-navy">{{ t('upload.cropZoom') }}</span>
        <input
          v-model.number="zoom"
          type="range"
          class="avatar-crop-range min-w-0 flex-1"
          :min="MIN_ZOOM"
          :max="MAX_ZOOM"
          step="0.01"
        >
      </label>

      <div class="flex gap-2">
        <button type="button" class="canva-black-cta flex-1" :disabled="exporting || !naturalW" @click="confirmCrop">
          {{ exporting ? t('common.loading') : t('upload.cropConfirm') }}
        </button>
        <button type="button" class="btn-secondary flex-1" :disabled="exporting" @click="emit('close')">
          {{ t('common.cancel') }}
        </button>
      </div>
    </div>
  </AppModal>
</template>

<style scoped>
.avatar-crop-stage {
  border-radius: 2px;
  cursor: grab;
}
.avatar-crop-stage:active {
  cursor: grabbing;
}
.avatar-crop-mask {
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.85);
}
.avatar-crop-range {
  accent-color: #c41e1e;
  height: 1.5rem;
}
</style>
