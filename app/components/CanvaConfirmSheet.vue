<script setup lang="ts">
withDefaults(defineProps<{
  open: boolean
  title: string
  body?: string
  confirmLabel?: string
  dismissLabel?: string
  pending?: boolean
  /** Single OK button — for post-action notices (replaces alert). */
  notice?: boolean
  danger?: boolean
}>(), {
  body: '',
  confirmLabel: '',
  dismissLabel: '',
  pending: false,
  notice: false,
  danger: false,
})

const emit = defineEmits<{
  confirm: []
  close: []
}>()

const { t } = useI18n()
</script>

<template>
  <AppModal
    :open="open"
    :title="title"
    sheet
    patterned
    max-width-class="canva-phone-shell max-w-sm"
    @close="emit('close')"
  >
    <div class="canva-auth-body space-y-4 px-5 pb-6 pt-2">
      <p v-if="body" class="text-start text-sm text-brand-gray-600">{{ body }}</p>
      <slot />
      <div class="space-y-2 pt-1">
        <button
          type="button"
          class="canva-gate-btn-primary"
          :class="danger && !notice ? 'bg-brand-primary' : ''"
          :disabled="pending"
          @click="emit('confirm')"
        >
          {{ pending ? t('common.loading') : (confirmLabel || (notice ? t('common.close') : t('booking.confirmYes'))) }}
        </button>
        <button
          v-if="!notice"
          type="button"
          class="canva-gate-btn-secondary"
          :disabled="pending"
          @click="emit('close')"
        >
          {{ dismissLabel || t('booking.confirmNo') }}
        </button>
      </div>
    </div>
  </AppModal>
</template>
