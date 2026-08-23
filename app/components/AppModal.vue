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

/**
 * Visual viewport → CSS vars only (keyboard-aware max-height for sheet bodies).
 * Never reposition the fixed overlay with offsetTop/height — on iOS Safari that
 * leaves an invisible full-screen hit target while Chrome iOS often still works.
 */
function syncVisualViewport() {
  if (!import.meta.client) return
  const vv = window.visualViewport
  if (!vv) {
    document.documentElement.style.setProperty('--app-vv-height', `${window.innerHeight}px`)
    document.documentElement.style.setProperty('--app-keyboard-inset', '0px')
    return
  }
  const height = Math.max(0, Math.round(vv.height))
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

watch(() => props.open, (isOpen) => {
  if (!import.meta.client) return
  document.body.style.overflow = isOpen ? 'hidden' : ''
  if (isOpen) {
    previousFocus.value = document.activeElement as HTMLElement | null
    syncVisualViewport()
    window.visualViewport?.addEventListener('resize', syncVisualViewport)
    window.visualViewport?.addEventListener('scroll', syncVisualViewport)
    window.addEventListener('resize', syncVisualViewport)
    nextTick(() => {
      dialogRef.value?.focus()
      document.addEventListener('keydown', onDialogKeydown)
    })
  } else {
    window.visualViewport?.removeEventListener('resize', syncVisualViewport)
    window.visualViewport?.removeEventListener('scroll', syncVisualViewport)
    window.removeEventListener('resize', syncVisualViewport)
    document.removeEventListener('keydown', onDialogKeydown)
    document.body.style.overflow = ''
    previousFocus.value?.focus()
  }
})

onMounted(() => {
  if (import.meta.client) {
    document.addEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => {
  if (import.meta.client) {
    document.removeEventListener('keydown', onKeydown)
    document.removeEventListener('keydown', onDialogKeydown)
    window.visualViewport?.removeEventListener('resize', syncVisualViewport)
    window.visualViewport?.removeEventListener('scroll', syncVisualViewport)
    window.removeEventListener('resize', syncVisualViewport)
    document.body.style.overflow = ''
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="venus-modal">
      <div
        v-if="open"
        class="fixed inset-0 flex flex-col overflow-y-auto overscroll-contain p-4 pb-[max(1rem,var(--sz-safe-bottom))] sm:p-6"
        :class="overlayClass || 'z-[55]'"
        role="presentation"
      >
        <!-- Dedicated backdrop: always inset-0. Do not size via visualViewport (Safari hit-test bug). -->
        <div
          class="absolute inset-0 z-0 bg-[#2c2c2a]/60 backdrop-blur-[2px]"
          aria-hidden="true"
          @click="close"
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
            @click.stop
            @focusin="onDialogFocusIn"
          >
            <div class="relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden">
              <div v-if="sheet" class="flex shrink-0 justify-center pt-3" aria-hidden="true">
                <span class="canva-sheet-handle" />
              </div>
              <div v-if="title" class="venus-modal-title-bar shrink-0" :class="sheet ? 'border-transparent bg-transparent pt-1' : ''">
                <h2 class="min-w-0 flex-1 truncate text-base font-bold text-brand-navy">{{ title }}</h2>
                <button
                  type="button"
                  :class="closeIcon
                    ? 'inline-flex h-8 w-8 shrink-0 items-center justify-center text-brand-navy hover:bg-brand-gray-100'
                    : 'btn-ghost px-3 py-1.5 text-xs'"
                  :style="closeIcon ? { borderRadius: 'var(--sz-canva-radius)' } : undefined"
                  :aria-label="$t('common.close')"
                  @click="close"
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
