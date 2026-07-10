<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()

const email = ref('')
const submitted = ref(false)
const error = ref('')
const submitting = ref(false)

async function submit() {
  submitting.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/forgot-password', { method: 'POST', body: { email: email.value } })
    submitted.value = true
  } catch {
    error.value = t('auth.resetRequestFailed')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm space-y-4 pt-8">
    <h1 class="font-display text-xl font-extrabold">{{ t('auth.forgotPassword') }}</h1>
    <p v-if="submitted" class="text-sm text-brand-gray-600">{{ t('auth.resetEmailSent') }}</p>
    <template v-else>
      <input v-model="email" type="email" :placeholder="t('auth.email')" class="w-full rounded-xl border px-3 py-2" />
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      <button type="button" class="btn-primary w-full" :disabled="submitting" @click="submit">
        {{ submitting ? t('common.loading') : t('auth.sendResetLink') }}
      </button>
    </template>
    <NuxtLink :to="localePath('/login')" class="block text-center text-sm text-brand-gray-600">{{ t('auth.login') }}</NuxtLink>
  </div>
</template>
