<script setup lang="ts">
const config = useRuntimeConfig()

const metaContent = computed(() => String(config.public.enamadMetaContent || '').trim())
const titleOverride = computed(() => String(config.public.enamadTitleOverride || '').trim())

useHead(() => ({
  htmlAttrs: {
    dir: 'rtl',
    lang: 'fa-IR',
  },
  title: titleOverride.value || undefined,
  meta: [
    { name: 'theme-color', content: '#C41E1E' },
    ...(metaContent.value ? [{ name: 'enamad', content: metaContent.value }] : []),
  ],
}))
</script>

<template>
  <AppRouteProgress />
  <PwaInstallBanner />
  <AppBugReportButton />
  <NuxtLayout>
    <NuxtPage
      :transition="{
        name: 'page',
        mode: 'out-in',
      }"
    />
  </NuxtLayout>
</template>
