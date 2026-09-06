<script setup lang="ts">
const props = defineProps<{
  open: boolean
  title?: string
  maxWidthClass?: string
  patterned?: boolean
  /** Dock to the bottom edge as a Canva-style action sheet on narrow viewports. */
  sheet?: boolean
  /** Overlay stacking — AuthFlow should sit above booking confirm (default z-50). */
  overlayClass?: string
  /** Icon-only header dismiss (X) instead of the «بستن» text button. */
  closeIcon?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const dialogRef = ref<HTMLElement | null>(null)
const previousFocus = ref<HTMLElement | null>(null)
/** True while this instance holds a slot in the shared body-scroll lock. */
const holdsBodyLock = ref(false)
/**
 * Backdrop dismiss is armed only after the opening pointer gesture finishes.
 * Timer-only / double-rAF-on-mount was not enough: the same click that opens
 * (تایید و ادامه / login) can hit the freshly mounted overlay and close it —
 * dead CTA on Chrome, Firefox, and mobile WebKit.
 *
 * Gates (both required):
 * 1. dismissArmed — false until opening gesture settles (or fallback timeout)
 * 2. backdropGestureActive — pointerdown on backdrop *after* arming only
 *    (pre-arm pointerdowns must not count; that was the remaining race)
 */
const dismissArmed = ref(false)
/** True when pointerdown landed on backdrop chrome after dismiss was armed. */
const backdropGestureActive = ref(false)
let dismissArmTimer: ReturnType<typeof setTimeout> | null = null
let removeOpenGestureListeners: (() => void) | null = null
/** Ignore pointerup that belonged to the opening gesture (already in flight). */
let ignorePointerReleaseUntil = 0

function clearDismissArmTimer() {
  if (dismissArmTimer != null) {
    clearTimeout(dismissArmTimer)
    dismissArmTimer = null
  }
}

function clearOpenGestureListeners() {
  removeOpenGestureListeners?.()
  removeOpenGestureListeners = null
}

function armDismiss() {
  if (!props.open) return
  dismissArmed.value = true
  // Drop any pre-arm backdrop press so it cannot pair with a post-arm click.
  backdropGestureActive.value = false
  clearDismissArmTimer()
  clearOpenGestureListeners()
}

/**
 * Arm dismiss after the opening gesture fully ends.
 * Do NOT soft-arm on the next paint — that re-opens the open→instant-close race
 * when a delayed/synthetic click lands on the new overlay.
 */
function scheduleDismissArm() {
  clearDismissArmTimer()
  clearOpenGestureListeners()
  dismissArmed.value = false
  backdropGestureActive.value = false
  // Opening CTA click: pointerup already fired; ignore stray release for a beat.
  ignorePointerReleaseUntil = Date.now() + 50

  let armed = false
  const tryArm = () => {
    if (armed || !props.open) return
    armed = true
    armDismiss()
  }

  const onPointerReleased = () => {
    if (Date.now() < ignorePointerReleaseUntil) return
    // One frame after pointerup so the releasing click cannot dismiss.
    requestAnimationFrame(() => {
      requestAnimationFrame(tryArm)
    })
  }

  window.addEventListener('pointerup', onPointerReleased, true)
  window.addEventListener('pointercancel', onPointerReleased, true)
  window.addEventListener('mouseup', onPointerReleased, true)
  window.addEventListener('touchend', onPointerReleased, true)

  removeOpenGestureListeners = () => {
    window.removeEventListener('pointerup', onPointerReleased, true)
    window.removeEventListener('pointercancel', onPointerReleased, true)
    window.removeEventListener('mouseup', onPointerReleased, true)
    window.removeEventListener('touchend', onPointerReleased, true)
  }

  // Fallback when open was programmatic (deep-link) or opening gesture already ended.
  dismissArmTimer = setTimeout(tryArm, 400)
}

function onOverlayPointerDown(event: PointerEvent) {
  // Only gestures that start *after* arming can dismiss. Pre-arm presses are the
  // open-click race (CTA / login under the newly mounted full-screen overlay).
  if (!dismissArmed.value) {
    backdropGestureActive.value = false
    return
  }
  // Dialog uses @pointerdown.stop so presses inside the sheet never reach here.
  const dialog = dialogRef.value
  if (dialog && event.target instanceof Node && dialog.contains(event.target)) {
    backdropGestureActive.value = false
    return
  }
  backdropGestureActive.value = true
}

function onOverlayClick() {
  if (!dismissArmed.value || !backdropGestureActive.value) {
    backdropGestureActive.value = false
    return
  }
  backdropGestureActive.value = false
  close()
}

/**
 * Visual viewport → CSS vars only (keyboard-aware max-height for sheet bodies).
 * Never reposition the fixed overlay with offsetTop/height — on iOS Safari that
 * leaves an invisible full-screen hit target while Chrome iOS often still works.
 */
function syncVisualViewport() {
  if (!import.meta.client) return
  const vv = window.visualViewport
  const fallback = Math.max(1, Math.round(window.innerHeight || 0))
  if (!vv) {
    document.documentElement.style.setProperty('--app-vv-height', `${fallback}px`)
    document.documentElement.style.setProperty('--app-keyboard-inset', '0px')
    return
  }
  // Never publish 0 — sheet max-height uses this var; 0 collapses the dialog and
  // leaves a full-screen inert wrapper that blocks club slot taps.
  const height = Math.max(1, Math.round(vv.height) || fallback)
  const keyboardInset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
  document.documentElement.style.setProperty('--app-vv-height', `${height}px`)
  document.documentElement.style.setProperty('--app-keyboard-inset', `${keyboardInset}px`)
}

function getFocusableElements(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  )].filter((el) => !el.hasAttribute('disabled'))
}

function onDialogKeydown(event: KeyboardEvent) {
  if (!props.open || event.key !== 'Tab' || !dialogRef.value) return
  const focusable = getFocusableElements(dialogRef.value)
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function close() {
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (props.open && event.key === 'Escape') {
    if (!dismissArmed.value) return
    event.preventDefault()
    close()
  }
}

function scrollFocusedFieldIntoView(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return
  if (!/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
  if ((target as HTMLInputElement).type === 'hidden') return
  // Wait for keyboard + visualViewport to settle, then center the field in the scrollable body.
  window.setTimeout(() => {
    syncVisualViewport()
    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
  }, 80)
}

function onDialogFocusIn(event: FocusEvent) {
  scrollFocusedFieldIntoView(event.target)
}

function acquireLock() {
  if (holdsBodyLock.value) return
  acquireModalBodyLock()
  holdsBodyLock.value = true
}

function releaseLock() {
  if (!holdsBodyLock.value) return
  releaseModalBodyLock()
  holdsBodyLock.value = false
}

watch(() => props.open, (isOpen) => {
  if (!import.meta.client) return
  clearDismissArmTimer()
  clearOpenGestureListeners()
  dismissArmed.value = false
  backdropGestureActive.value = false
  if (isOpen) {
    acquireLock()
    previousFocus.value = document.activeElement as HTMLElement | null
    syncVisualViewport()
    window.visualViewport?.addEventListener('resize', syncVisualViewport)
    window.visualViewport?.addEventListener('scroll', syncVisualViewport)
    window.addEventListener('resize', syncVisualViewport)
    // post: dialogRef exists; schedule arm after mount so open-click cannot pair.
    scheduleDismissArm()
    nextTick(() => {
      dialogRef.value?.focus()
      document.addEventListener('keydown', onDialogKeydown)
    })
  } else {
    window.visualViewport?.removeEventListener('resize', syncVisualViewport)
    window.visualViewport?.removeEventListener('scroll', syncVisualViewport)
    window.removeEventListener('resize', syncVisualViewport)
    document.removeEventListener('keydown', onDialogKeydown)
    releaseLock()
    // Avoid focusing a hidden file input (Safari tap dead-zone after photo pick).
    const restore = previousFocus.value
    previousFocus.value = null
    if (restore && restore.isConnected && restore.getAttribute('type') !== 'file') {
      restore.focus()
    }
  }
}, { flush: 'post' })

onMounted(() => {
  if (import.meta.client) {
    document.addEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => {
  if (import.meta.client) {
    clearDismissArmTimer()
    clearOpenGestureListeners()
    document.removeEventListener('keydown', onKeydown)
    document.removeEventListener('keydown', onDialogKeydown)
    window.visualViewport?.removeEventListener('resize', syncVisualViewport)
    window.visualViewport?.removeEventListener('scroll', syncVisualViewport)
    window.removeEventListener('resize', syncVisualViewport)
    releaseLock()
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="venus-modal">
      <!--
        Click-to-dismiss MUST live on this root (or the flex shell). The centered
        flex-1 shell paints above the backdrop and used to swallow clicks without
        closing — after تایید و ادامه the page looked open but slots/CTA were dead.
      -->
      <div
        v-if="open"
        class="fixed inset-0 flex flex-col overflow-y-auto overscroll-contain p-4 pb-[max(1rem,var(--sz-safe-bottom))] sm:p-6"
        :class="overlayClass || 'z-[55]'"
        role="presentation"
        data-app-modal-overlay
        @pointerdown="onOverlayPointerDown"
        @click="onOverlayClick"
      >
        <!-- Dedicated backdrop: always inset-0. Do not size via visualViewport (Safari hit-test bug). -->
        <div
          class="absolute inset-0 z-0 bg-[#2c2c2a]/60 backdrop-blur-[2px]"
          aria-hidden="true"
        />
        <div
          class="relative z-[1] flex min-h-0 w-full flex-1 justify-center"
          :class="sheet ? 'items-end sm:items-center' : 'items-center'"
        >
          <div
            ref="dialogRef"
            role="dialog"
            aria-modal="true"
            :aria-label="title"
            tabindex="-1"
            class="flex min-h-0 w-full flex-col overflow-hidden border border-brand-gray-200 shadow-tail-md outline-none animate-venus-fade-up"
            :class="[
              maxWidthClass || 'max-w-md',
              patterned ? 'canva-auth-sheet' : 'bg-brand-cream',
              /* LOCKED: Canva phone frames ≤2px — never rounded-xl soft card */
              sheet ? 'canva-sheet-dialog' : (patterned ? 'canva-modal-frame' : 'rounded-xl'),
            ]"
            @pointerdown.stop
            @click.stop
            @focusin="onDialogFocusIn"
          >
            <div class="relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden">
              <div v-if="sheet" class="flex shrink-0 justify-center pt-3" aria-hidden="true">
                <span class="canva-sheet-handle" />
              </div>
              <div
                v-if="title || closeIcon"
                class="venus-modal-title-bar shrink-0"
                :class="sheet ? 'border-transparent bg-transparent pt-1' : ''"
              >
                <h2 v-if="title" class="min-w-0 flex-1 truncate text-base font-bold text-brand-navy">{{ title }}</h2>
                <span v-else class="min-w-0 flex-1" aria-hidden="true" />
                <button
                  type="button"
                  :class="closeIcon
                    ? 'inline-flex h-8 w-8 shrink-0 items-center justify-center text-brand-navy hover:bg-brand-gray-100'
                    : 'btn-ghost px-3 py-1.5 text-xs'"
                  :style="closeIcon ? { borderRadius: 'var(--sz-canva-radius)' } : undefined"
                  :aria-label="$t('common.close')"
                  @click.stop.prevent="close"
                >
                  <AppIcon v-if="closeIcon" name="close" size="sm" />
                  <template v-else>{{ $t('common.close') }}</template>
                </button>
              </div>
              <div class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                <slot />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
