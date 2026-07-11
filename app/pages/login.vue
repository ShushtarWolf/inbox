<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { startGoogleSignIn } = useGoogleAuth()

const email = ref('')
const password = ref('')

const returnTo = computed(() => {
  const value = route.query.returnTo
  return typeof value === 'string' ? value : ''
})

const error = computed(() => {
  if (route.query.error === 'invalid') return t('auth.invalidCredentials')
  if (route.query.error === 'oauth') return t('auth.useGoogle')
  if (route.query.error === 'server') return t('auth.loginFailed')
  if (route.query.error === 'session') return t('auth.sessionExpired')
  return ''
})
</script>

<template>
  <form class="mx-auto max-w-sm venus-form-stack pt-8" method="post" action="/api/auth/login-web">
    <h1 class="font-display text-xl font-bold">{{ t('auth.login') }}</h1>
    <AppFormField :label="t('auth.email')">
      <input v-model="email" name="email" type="email" dir="ltr" class="neo-input" autocomplete="email" />
    </AppFormField>
    <AppFormField :label="t('auth.password')">
      <input v-model="password" name="password" type="password" class="neo-input" autocomplete="current-password" />
    </AppFormField>
    <input type="hidden" name="locale" :value="locale" />
    <input type="hidden" name="returnTo" :value="returnTo" />
    <p v-if="error" class="venus-alert-error">{{ error }}</p>
    <button type="submit" class="btn-primary w-full">{{ t('auth.login') }}</button>
    <button type="button" class="btn-secondary w-full" @click="startGoogleSignIn(returnTo)">
      {{ t('auth.google') }}
    </button>
    <NuxtLink :to="localePath('/forgot-password')" class="block text-center text-sm font-bold text-brand-navy underline">{{ t('auth.forgotPassword') }}</NuxtLink>
    <NuxtLink :to="localePath({ path: '/register', query: returnTo ? { returnTo } : {} })" class="block text-center text-sm font-bold text-brand-navy underline">{{ t('auth.register') }}</NuxtLink>
    <div class="space-y-1 text-center text-xs text-brand-gray-600">
      <NuxtLink :to="localePath('/register/owner')" class="block font-bold text-brand-navy underline">{{ t('register.ownerLink') }}</NuxtLink>
      <NuxtLink :to="localePath('/register/coach')" class="block font-bold text-brand-navy underline">{{ t('register.coachLink') }}</NuxtLink>
    </div>
  </form>
</template>
