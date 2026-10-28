<script setup lang="ts">
// SoT pages.offline: bare .authc card, no public header/footer
definePageMeta({ layout: false })
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-brand-cream px-4 py-10">
    <div class="canva-authbox text-center">
      <div class="relative z-[1]">
        <img
          src="/brand/inbox-logo-lockup.svg"
          alt="inbox"
          dir="ltr"
          class="canva-error-brand inbox-brand-lockup mb-5"
          style="height: 20px; width: auto; margin-inline: auto;"
        >
        <h1 class="canva-authbox-title">{{ $t('pwa.offlineTitle') }}</h1>
        <p class="canva-authbox-sub">{{ $t('pwa.offlineBody') }}</p>
        <p class="mt-3 text-xs font-bold text-brand-gray-400">inbox · inboxs.ir</p>
        <button type="button" class="canva-cta mt-6 w-full" @click="reloadNuxtApp()">{{ $t('common.retry') }}</button>
        <NuxtLink :to="$localePath('/')" class="canva-gate-btn-secondary mt-3 block w-full text-center">{{ $t('booking.successBackHome') }}</NuxtLink>
      </div>
    </div>
  </div>
</template>
