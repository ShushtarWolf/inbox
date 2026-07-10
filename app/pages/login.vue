<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

const email = ref('athlete@inbox.local')
const password = ref('demo1234')

const returnTo = computed(() => {
  const value = route.query.returnTo
  return typeof value === 'string' ? value : ''
})

const error = computed(() => {
  if (route.query.error === 'invalid') return t('auth.invalidCredentials')
  if (route.query.error === 'server') return t('auth.loginFailed')
  if (route.query.error === 'session') return t('auth.sessionExpired')
  return ''
})
</script>

<template>
  <form class="mx-auto max-w-sm space-y-4 pt-8" method="post" action="/api/auth/login-web">
    <h1 class="font-display text-xl font-bold">{{ t('auth.login') }}</h1>
    <input v-model="email" name="email" type="email" :placeholder="t('auth.email')" class="neo-input" autocomplete="email" />
    <input v-model="password" name="password" type="password" :placeholder="t('auth.password')" class="neo-input" autocomplete="current-password" />
    <input type="hidden" name="locale" :value="locale" />
    <input type="hidden" name="returnTo" :value="returnTo" />
    <p v-if="error" class="venus-alert-error">{{ error }}</p>
    <button type="submit" class="btn-primary w-full">{{ t('auth.login') }}</button>
    <NuxtLink :to="localePath('/forgot-password')" class="block text-center text-sm font-bold text-brand-navy underline">{{ t('auth.forgotPassword') }}</NuxtLink>
    <NuxtLink :to="localePath({ path: '/register', query: returnTo ? { returnTo } : {} })" class="block text-center text-sm font-bold text-brand-navy underline">{{ t('auth.register') }}</NuxtLink>
  </form>
</template>
