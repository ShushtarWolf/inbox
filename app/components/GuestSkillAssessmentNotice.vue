<script setup lang="ts">
const { t } = useI18n()
const { savedNotice, flushError, dismissSavedNotice } = usePendingGuestAssessment()
</script>

<template>
  <div
    v-if="savedNotice"
    class="flex flex-wrap items-center justify-between gap-2 border border-brand-gold bg-brand-gold-soft px-3 py-2 text-sm text-brand-navy"
    role="status"
  >
    <span>{{ savedNotice }}</span>
    <button type="button" class="text-xs font-bold text-brand-primary" @click="dismissSavedNotice">
      {{ t('common.close') }}
    </button>
  </div>
  <p v-else-if="flushError" role="alert" class="text-sm text-brand-primary">
    {{ flushError }}
  </p>
</template>