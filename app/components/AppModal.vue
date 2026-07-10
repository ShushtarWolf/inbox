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
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/40 p-4 backdrop-blur-sm"
      role="presentation"
      @click.self="close"
    >
      <div
        ref="dialogRef"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
        class="w-full outline-none"
        :class="maxWidthClass || 'max-w-md'"
        @click.stop
      >
        <slot />
      </div>
    </div>
  </Teleport>
</template>
