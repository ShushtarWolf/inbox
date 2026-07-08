<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { login } = useAuth()

const email = ref('athlete@inbox.local')
const password = ref('demo1234')
const error = ref('')
const loading = ref(false)

function redirectTo(target: string) {
  if (import.meta.client) {
    window.location.assign(target)
    return
  }
  return navigateTo(target)
}

async function submit() {
  error.value = ''
  loading.value = true
  let user

  try {
    user = await login(email.value, password.value)
  } catch (e: unknown) {
    const status = (e as { statusCode?: number })?.statusCode
    error.value = status === 401 ? t('auth.invalidCredentials') : t('auth.loginFailed')
    loading.value = false
    return
  }

  const target = user.role === 'CLUB_ADMIN'
    ? localePath('/owner')
    : user.role === 'COACH'
      ? localePath('/coach')
      : localePath('/athlete')

  loading.value = false
  await redirectTo(target)
}
</script>

<template>
  <form class="mx-auto max-w-sm space-y-4 pt-8" @submit.prevent="submit">
    <h1 class="font-display text-xl font-extrabold">{{ t('auth.login') }}</h1>
    <input v-model="email" type="email" :placeholder="t('auth.email')" class="w-full rounded-xl border px-3 py-2" autocomplete="email" />
    <input v-model="password" type="password" :placeholder="t('auth.password')" class="w-full rounded-xl border px-3 py-2" autocomplete="current-password" />
    <p v-if="error" class="text-sm text-brand-primary">{{ error }}</p>
    <button type="submit" class="btn-primary w-full" :disabled="loading">{{ t('auth.login') }}</button>
    <NuxtLink :to="localePath('/register')" class="block text-center text-sm text-brand-gray-600">{{ t('auth.register') }}</NuxtLink>
  </form>
</template>
