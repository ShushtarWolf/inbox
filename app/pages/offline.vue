<template>
  <div class="flex min-h-dvh items-center justify-center bg-brand-cream px-4 py-10">
    <div class="canva-result-sheet w-full max-w-md p-8 text-center">
      <div class="relative z-[1]">
        <img src="/brand/inbox-logo-mark.svg" alt="" class="mx-auto mb-5 h-16 w-16" />
        <h1 class="text-xl font-bold text-brand-navy">{{ $t('pwa.offlineTitle') }}</h1>
        <p class="mt-2 text-sm text-brand-gray-600">{{ $t('pwa.offlineBody') }}</p>
        <button type="button" class="btn-primary mt-6 w-full" @click="reloadNuxtApp()">{{ $t('common.retry') }}</button>
        <NuxtLink :to="$localePath('/')" class="btn-ghost mt-3 block w-full text-center">{{ $t('nav.home') }}</NuxtLink>
      </div>
    </div>
  </div>
</template>
