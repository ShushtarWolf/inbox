<script setup lang="ts">
/**
 * Legacy URL → owner registration. Redirect runs in route middleware (SSR 301 + client
 * nav) instead of a top-level await in setup, which could leave the page stuck blank.
 * The template is a visible fallback (link) if navigation is ever blocked.
 */
definePageMeta({
  middleware: [
    () => navigateTo('/register/owner', { redirectCode: 301, replace: true }),
  ],
})

const { t } = useI18n()
const localePath = useLocalePath()

useSeoMeta({
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div class="mx-auto max-w-md px-4 py-10 text-start" data-testid="clubs-apply-fallback">
    <p class="text-sm text-brand-gray-700">{{ t('clubs.applyMoved') }}</p>
    <NuxtLink :to="localePath('/register/owner')" class="canva-cta mt-4 inline-flex">
      {{ t('clubs.applyMovedCta') }}
    </NuxtLink>
  </div>
</template>
