<script setup lang="ts">
const { t } = useI18n()
const open = ref(false)
</script>

<template>
  <button
    type="button"
    class="fixed z-[60] flex h-12 items-center gap-2 rounded-full bg-brand-primary px-4 text-white shadow-venus-md transition hover:brightness-110 end-4 bottom-[calc(var(--sz-tab-bar-height)+var(--sz-safe-bottom)+1rem)] lg:bottom-6"
    :aria-label="t('bugReport.button')"
    :title="t('bugReport.button')"
    @click="open = true"
  >
    <AppIcon name="bug_report" size="md" />
    <span class="hidden text-xs font-bold sm:inline">{{ t('bugReport.button') }}</span>
  </button>
  <AppBugReportModal :open="open" @close="open = false" />
</template>
