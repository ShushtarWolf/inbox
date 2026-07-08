<script setup lang="ts">
const { locale } = useI18n()
const switchLocalePath = useSwitchLocalePath()

useHead(() => ({
  htmlAttrs: {
    dir: locale.value === 'fa' ? 'rtl' : 'ltr',
    lang: locale.value === 'fa' ? 'fa-IR' : 'en-US',
  },
  link: [
    { rel: 'alternate', hreflang: 'fa-IR', href: switchLocalePath('fa') || '/' },
    { rel: 'alternate', hreflang: 'en-US', href: switchLocalePath('en') || '/en' },
  ],
}))
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
