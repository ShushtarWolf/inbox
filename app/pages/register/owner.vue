<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { openRegister, openLogin } = useAuthFlow()

const returnTo = computed(() => typeof route.query.returnTo === 'string' ? route.query.returnTo : '')

onMounted(() => {
  openRegister({ returnTo: returnTo.value, role: 'CLUB_ADMIN' })
})
</script>

<template>
  <div class="mx-auto max-w-sm space-y-4 pt-8">
    <div class="text-center">
      <img src="/brand/inbox-logo-mark.svg" alt="" class="mx-auto h-12 w-12" />
      <h1 class="mt-3 font-display text-xl font-bold">{{ t('register.ownerTitle') }}</h1>
      <p class="mt-1 text-sm text-brand-gray-600">{{ t('register.ownerSubtitle') }}</p>
    </div>

    <RegisterRolePicker active="owner" />

    <p class="text-sm text-brand-gray-600">{{ t('auth.ownerPhoneRegisterHint') }}</p>
    <button type="button" class="btn-primary w-full py-3" @click="openRegister({ returnTo, role: 'CLUB_ADMIN' })">
      {{ t('auth.registerWithPhone') }}
    </button>

    <div class="space-y-2 border-t border-brand-gray-200 pt-4">
      <button type="button" class="btn-ghost w-full" @click="openLogin({ returnTo: returnTo || undefined })">
        {{ t('auth.login') }}
      </button>
      <NuxtLink :to="localePath('/login')" class="block text-center text-sm font-bold text-brand-navy underline">
        {{ t('auth.loginToInbox') }}
      </NuxtLink>
    </div>
  </div>
</template>
