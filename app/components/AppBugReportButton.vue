<script setup lang="ts">
const config = useRuntimeConfig()
const { t } = useI18n()

const enabled = computed(() => config.public.bugReportsEnabled)
const open = ref(false)
</script>

<template>
  <template v-if="enabled">
    <button
      type="button"
      class="fixed z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary text-white shadow-venus-md transition hover:brightness-110 end-4 bottom-[calc(var(--sz-tab-bar-height)+var(--sz-safe-bottom)+1rem)] lg:bottom-6"
      :aria-label="t('bugReport.button')"
      :title="t('bugReport.button')"
      @click="open = true"
    >
      <AppIcon name="bug_report" size="md" />
    </button>
    <AppBugReportModal :open="open" @close="open = false" />
  </template>
</template>
