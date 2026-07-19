<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const { openLogin } = useAuthFlow()

usePageSeo({
  title: () => t('seo.forgotPasswordTitle'),
  description: () => t('seo.forgotPasswordDescription'),
  path: '/forgot-password',
})

const email = ref('')
const submitted = ref(false)
const error = ref('')
const submitting = ref(false)
const debugResetUrl = ref('')
const emailMode = ref<'log' | 'live'>('log')

async function submit() {
  submitting.value = true
  error.value = ''
  debugResetUrl.value = ''
  try {
    const data = await $fetch<{
      ok: boolean
      emailMode?: 'log' | 'live'
      debugResetUrl?: string
    }>('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: email.value },
    })
    submitted.value = true
    emailMode.value = data.emailMode === 'live' ? 'live' : 'log'
    debugResetUrl.value = data.debugResetUrl || ''
  } catch {
    error.value = t('auth.resetRequestFailed')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm space-y-4 pt-8">
    <h1 class="font-display text-xl font-bold">{{ t('auth.forgotPassword') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('auth.resetPreferPhoneHint') }}</p>
    <template v-if="submitted">
      <p class="text-sm font-bold text-brand-gray-600">
        {{ emailMode === 'live' ? t('auth.resetEmailSent') : t('auth.resetEmailLogMode') }}
      </p>
      <p v-if="debugResetUrl" class="rounded-lg bg-brand-primary-soft px-3 py-2 text-center text-xs font-bold text-brand-primary">
        {{ t('auth.debugResetHint') }}
        <a :href="debugResetUrl" class="mt-1 block underline break-all" dir="ltr">{{ debugResetUrl }}</a>
      </p>
      <button type="button" class="btn-secondary w-full py-3" @click="openLogin()">
        {{ t('auth.loginWithPhone') }}
      </button>
    </template>
    <template v-else>
      <AppFormField :label="t('auth.email')">
        <input v-model="email" type="email" dir="ltr" class="neo-input" autocomplete="email" />
      </AppFormField>
      <p v-if="error" class="venus-alert-error">{{ error }}</p>
      <button type="button" class="btn-primary w-full" :disabled="submitting" @click="submit">
        {{ submitting ? t('common.loading') : t('auth.sendResetLink') }}
      </button>
      <button type="button" class="btn-secondary w-full py-3" @click="openLogin()">
        {{ t('auth.loginWithPhone') }}
      </button>
    </template>
    <NuxtLink :to="localePath('/login')" class="block text-center text-sm font-bold text-brand-navy underline">{{ t('auth.login') }}</NuxtLink>
  </div>
</template>
