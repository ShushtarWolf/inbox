<script setup lang="ts">
/**
 * Failure notice sheet for image uploads.
 * Pair with `useImageUpload()` askPick / dismissFailure.
 */
withDefaults(defineProps<{
  failureOpen: boolean
  failureMessage?: string
  /** Raise above AuthFlow (z-[70]) when nesting. */
  overlayClass?: string
}>(), {
  failureMessage: '',
  overlayClass: '',
})

const emit = defineEmits<{
  'close-failure': []
}>()

const { t } = useI18n()
</script>

<template>
  <CanvaConfirmSheet
    :open="failureOpen"
    notice
    :title="t('upload.failedTitle')"
    :body="failureMessage || t('upload.failed')"
    :overlay-class="overlayClass || undefined"
    @confirm="emit('close-failure')"
    @close="emit('close-failure')"
  />
</template>
