<script setup lang="ts">
const props = defineProps<{
  open: boolean
  title?: string
  maxWidthClass?: string
  patterned?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const dialogRef = ref<HTMLElement | null>(null)
const previousFocus = ref<HTMLElement | null>(null)

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

watch(() => props.open, (isOpen) => {
  if (import.meta.client) {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    if (isOpen) {
      previousFocus.value = document.activeElement as HTMLElement | null
      nextTick(() => {
        dialogRef.value?.focus()
        document.addEventListener('keydown', onDialogKeydown)
      })
    } else {
      document.removeEventListener('keydown', onDialogKeydown)
      previousFocus.value?.focus()
    }
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
    document.body.style.overflow = ''
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="venus-modal">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-[#2c2c2a]/60 p-4 pb-[max(1rem,var(--sz-safe-bottom))] backdrop-blur-[2px] sm:p-6"
        role="presentation"
        @click.self="close"
      >
        <div class="flex flex-1 items-center justify-center py-2 sm:py-4">
          <div
            ref="dialogRef"
            role="dialog"
            aria-modal="true"
            :aria-label="title"
            tabindex="-1"
            class="w-full overflow-hidden rounded-xl border border-brand-gray-200 shadow-tail-md outline-none animate-venus-fade-up"
            :class="[
              maxWidthClass || 'max-w-md',
              patterned ? 'canva-auth-sheet' : 'bg-brand-cream',
            ]"
            @click.stop
          >
            <div class="relative z-[1]">
              <div v-if="title" class="venus-modal-title-bar">
                <h2 class="text-base font-bold text-brand-navy">{{ title }}</h2>
                <button
                  type="button"
                  class="btn-ghost px-3 py-1.5 text-xs"
                  :aria-label="$t('common.close')"
                  @click="close"
                >
                  {{ $t('common.close') }}
                </button>
              </div>
              <slot />
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
