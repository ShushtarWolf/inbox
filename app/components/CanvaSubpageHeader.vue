<script setup lang="ts">
/**
 * Secondary-page escape chrome for athlete/owner phone shells (CRM pattern).
 * Bottom nav alone is not enough when the page is not a primary tab.
 */
const props = defineProps<{
  /** Locale path, optionally with query (`/owner/calendar?more=1`). */
  to: string
  title?: string
}>()

const { t } = useI18n()
const localePath = useLocalePath()

const href = computed(() => {
  if (props.to.includes('?')) {
    const [path, qs] = props.to.split('?')
    const query = Object.fromEntries(new URLSearchParams(qs))
    return localePath({ path: path || '/', query })
  }
  return localePath(props.to)
})
</script>

<template>
  <header class="hidden items-center justify-between gap-3 max-[430px]:flex">
    <NuxtLink :to="href" class="inline-flex shrink-0 text-brand-navy" :aria-label="t('common.back')">
      <AppIcon name="arrow_forward" size="sm" />
    </NuxtLink>
    <h1
      v-if="title"
      class="min-w-0 flex-1 text-start text-lg font-bold text-brand-navy"
    >
      {{ title }}
    </h1>
    <span v-else class="flex-1" aria-hidden="true" />
  </header>
</template>
