<script setup lang="ts">
const props = defineProps<{
  open: boolean
  title?: string
  maxWidthClass?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const dialogRef = ref<HTMLElement | null>(null)

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
      nextTick(() => dialogRef.value?.focus())
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
    document.body.style.overflow = ''
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="venus-modal">
      <div
        v-if="open"
        class="fixed inset-0 z-50 overflow-y-auto bg-brand-navy/25 p-4 sm:p-6"
        role="presentation"
        @click.self="close"
      >
        <div class="flex min-h-full items-end justify-center sm:items-center">
          <div
            ref="dialogRef"
            role="dialog"
            aria-modal="true"
            :aria-label="title"
            tabindex="-1"
            class="w-full outline-none animate-venus-fade-up"
            :class="maxWidthClass || 'max-w-md'"
            @click.stop
          >
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
