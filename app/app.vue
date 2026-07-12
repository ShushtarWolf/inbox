<script setup lang="ts">
useHead({
  htmlAttrs: {
    dir: 'rtl',
    lang: 'fa-IR',
  },
  meta: [
    { name: 'theme-color', content: '#C41E1E' },
  ],
})
</script>

<template>
  <AppRouteProgress />
  <PwaInstallBanner />
  <NuxtLayout>
    <NuxtPage
      :transition="{
        name: 'page',
        mode: 'out-in',
      }"
    />
  </NuxtLayout>
</template>
