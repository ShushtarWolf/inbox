<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { login } = useAuth()
const { startGoogleSignIn, googleAuthEnabled } = useGoogleAuth()
const { openLogin, openRegister } = useAuthFlow()

const email = ref('')
const password = ref('')
const submitting = ref(false)
const formError = ref('')

const returnTo = computed(() => {
  const value = route.query.returnTo
  return typeof value === 'string' ? value : ''
})

const queryError = computed(() => {
  if (route.query.error === 'invalid' || route.query.error === 'useGoogle') return t('auth.invalidCredentials')
  if (route.query.error === 'disabled') return t('auth.accountDisabled')
  if (route.query.error === 'google' || route.query.error === 'oauth') return t('auth.googleFailed')
  if (route.query.error === 'server') return t('auth.loginFailed')
  if (route.query.error === 'session') return t('auth.sessionExpired')
  return ''
})

const error = computed(() => formError.value || queryError.value)

async function submitEmailLogin() {
  formError.value = ''
  if (!email.value.trim() || !password.value) {
    formError.value = t('auth.invalidCredentials')
    return
  }
  submitting.value = true
  try {
    await login(email.value.trim(), password.value, returnTo.value || undefined)
  } catch (err: unknown) {
    const status = err && typeof err === 'object' && 'statusCode' in err
      ? (err as { statusCode?: number }).statusCode
      : undefined
    if (status === 403) formError.value = t('auth.accountDisabled')
    else if (status === 429) formError.value = t('errors.rateLimited')
    else formError.value = t('auth.invalidCredentials')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm space-y-4 pt-8">
    <div class="text-center">
      <img src="/brand/inbox-logo-mark.svg" alt="" class="mx-auto h-12 w-12" />
      <h1 class="mt-3 font-display text-xl font-bold">{{ t('auth.loginToInbox') }}</h1>
      <p class="mt-1 text-sm text-brand-gray-600">{{ t('auth.emailPasswordHint') }}</p>
    </div>

    <p v-if="error" class="venus-alert-error">{{ error }}</p>

    <form class="venus-form-stack" @submit.prevent="submitEmailLogin">
      <AppFormField field-id="login-email" :label="t('auth.email')" required>
        <input
          id="login-email"
          v-model="email"
          name="email"
          type="email"
          dir="ltr"
          class="neo-input"
          autocomplete="email"
          required
        />
      </AppFormField>
      <AppFormField field-id="login-password" :label="t('auth.password')" required>
        <input
          id="login-password"
          v-model="password"
          name="password"
          type="password"
          class="neo-input"
          autocomplete="current-password"
          required
        />
      </AppFormField>
      <button type="submit" class="btn-primary w-full py-3" :disabled="submitting">
        {{ submitting ? t('common.loading') : t('auth.login') }}
      </button>
    </form>

    <NuxtLink :to="localePath('/forgot-password')" class="block text-center text-sm font-bold text-brand-navy underline">
      {{ t('auth.forgotPassword') }}
    </NuxtLink>

    <AppGoogleSignInButton v-if="googleAuthEnabled" @click="startGoogleSignIn(returnTo || undefined)" />

    <div class="space-y-2 border-t border-brand-gray-200 pt-4">
      <button type="button" class="btn-secondary w-full py-3" @click="openLogin({ returnTo: returnTo || undefined })">
        {{ t('auth.loginWithPhone') }}
      </button>
      <button type="button" class="btn-ghost w-full" @click="openRegister({ returnTo: returnTo || undefined })">
        {{ t('auth.register') }}
      </button>
    </div>
  </div>
</template>
