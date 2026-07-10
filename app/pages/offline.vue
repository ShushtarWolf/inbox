<template>
  <div class="mx-auto flex min-h-[70dvh] max-w-md items-center px-4 py-10">
    <div class="ios-card w-full p-6 text-center">
      <img src="/brand/inbox-logo-mark.svg" alt="" class="mx-auto mb-4 h-12 w-12" />
      <h1 class="font-display text-xl font-bold">{{ $t('pwa.offlineTitle') }}</h1>
      <p class="mt-2 text-sm text-brand-gray-600">{{ $t('pwa.offlineBody') }}</p>
      <button type="button" class="btn-primary mt-5 w-full" @click="reloadNuxtApp()">{{ $t('common.retry') }}</button>
    </div>
  </div>
</template>
