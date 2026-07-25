<script setup lang="ts">
/** Compact legal strip under owner phone pages (Canva p27+). */
const { t } = useI18n()
const localePath = useLocalePath()

const links = computed(() => [
  { to: localePath('/about'), label: t('legal.about') },
  { to: localePath('/contact'), label: t('legal.contact') },
  { to: localePath('/owner/support'), label: t('owner.support') },
  { to: localePath('/terms'), label: t('legal.terms') },
])
</script>

<template>
  <nav class="canva-legal-footer" :aria-label="t('legal.about')">
    <template v-for="(link, index) in links" :key="link.to">
      <span v-if="index" class="text-brand-gray-300" aria-hidden="true">·</span>
      <NuxtLink :to="link.to" class="hover:text-brand-primary">{{ link.label }}</NuxtLink>
    </template>
  </nav>
</template>
