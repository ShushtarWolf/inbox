<script setup lang="ts">
/**
 * Secondary-page escape chrome for athlete/owner phone shells (CRM pattern).
 * Bottom nav alone is not enough when the page is not a primary tab.
 * LOCKED: logo mark + logotype → home (RIGHT in RTL); back sits in that
 * same start cluster (match CanvaPublicChrome), not as a lonely LEFT action.
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
  <div class="max-[430px]:space-y-1">
    <header class="canva-home-chrome hidden max-[430px]:flex">
      <div class="flex min-w-0 items-center gap-1">
        <NuxtLink
          :to="href"
          class="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center p-2 text-brand-navy"
          :aria-label="t('common.back')"
        >
          <AppIcon name="arrow_forward" size="sm" />
        </NuxtLink>
        <NuxtLink :to="localePath('/')" class="flex min-w-0 items-center gap-2" :aria-label="t('brand.name')">
          <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7 shrink-0" />
          <InboxWordmark class="text-lg text-brand-primary" />
        </NuxtLink>
      </div>
    </header>
    <h1
      v-if="title"
      class="text-start text-lg font-bold text-brand-navy min-[431px]:text-2xl"
    >
      {{ title }}
    </h1>
  </div>
</template>
