<script setup lang="ts">
/**
 * Rules-before-pick + failure notice sheets for image uploads.
 * Pair with `useImageUpload()` askPick / confirmRules / dismissFailure.
 */
withDefaults(defineProps<{
  rulesOpen: boolean
  failureOpen: boolean
  failureMessage?: string
  /** Raise above AuthFlow (z-[70]) when nesting. */
  overlayClass?: string
}>(), {
  failureMessage: '',
  overlayClass: '',
})

const emit = defineEmits<{
  'confirm-rules': []
  'close-rules': []
  'close-failure': []
}>()

const { t } = useI18n()
</script>

<template>
  <CanvaConfirmSheet
    :open="rulesOpen"
    :title="t('upload.rulesTitle')"
    :body="t('upload.rulesBody')"
    :confirm-label="t('upload.rulesConfirm')"
    :dismiss-label="t('common.cancel')"
    :overlay-class="overlayClass || undefined"
    @confirm="emit('confirm-rules')"
    @close="emit('close-rules')"
  />
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
