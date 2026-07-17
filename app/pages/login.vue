<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { startGoogleSignIn, googleAuthEnabled } = useGoogleAuth()
const { openGate, openLogin, openRegister } = useAuthFlow()

const returnTo = computed(() => {
  const value = route.query.returnTo
  return typeof value === 'string' ? value : ''
})

const error = computed(() => {
  if (route.query.error === 'invalid') return t('auth.invalidCredentials')
  if (route.query.error === 'useGoogle') return t('auth.useGoogle')
  if (route.query.error === 'google' || route.query.error === 'oauth') return t('auth.googleFailed')
  if (route.query.error === 'server') return t('auth.loginFailed')
  if (route.query.error === 'session') return t('auth.sessionExpired')
  return ''
})

onMounted(() => {
  openLogin({ returnTo: returnTo.value })
})
</script>

<template>
  <div class="mx-auto max-w-sm space-y-4 pt-8 text-center">
    <img src="/brand/inbox-logo-mark.svg" alt="" class="mx-auto h-12 w-12" />
    <h1 class="font-display text-xl font-bold">{{ t('auth.loginToInbox') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('auth.phoneLoginHint') }}</p>
    <p v-if="error" class="venus-alert-error text-start">{{ error }}</p>
    <button type="button" class="btn-primary w-full py-3" @click="openLogin({ returnTo })">
      {{ t('auth.loginWithPhone') }}
    </button>
    <AppGoogleSignInButton v-if="googleAuthEnabled" @click="startGoogleSignIn(returnTo)" />
    <button type="button" class="btn-ghost w-full" @click="openRegister({ returnTo })">
      {{ t('auth.register') }}
    </button>
    <button type="button" class="text-sm font-bold text-brand-navy underline" @click="openGate({ returnTo })">
      {{ t('auth.loginRegister') }}
    </button>
    <details class="rounded-xl border border-brand-gray-200 bg-white p-4 text-start">
      <summary class="cursor-pointer text-sm font-bold text-brand-gray-600">{{ t('auth.emailPasswordFallback') }}</summary>
      <form class="venus-form-stack mt-4" method="post" action="/api/auth/login-web">
        <AppFormField field-id="login-email" :label="t('auth.email')">
          <input id="login-email" name="email" type="email" dir="ltr" class="neo-input" autocomplete="email" />
        </AppFormField>
        <AppFormField field-id="login-password" :label="t('auth.password')">
          <input id="login-password" name="password" type="password" class="neo-input" autocomplete="current-password" />
        </AppFormField>
        <input type="hidden" name="locale" value="fa" />
        <input type="hidden" name="returnTo" :value="returnTo" />
        <button type="submit" class="btn-secondary w-full">{{ t('auth.login') }}</button>
      </form>
      <NuxtLink :to="localePath('/forgot-password')" class="mt-3 block text-center text-sm font-bold text-brand-navy underline">
        {{ t('auth.forgotPassword') }}
      </NuxtLink>
    </details>
  </div>
</template>
