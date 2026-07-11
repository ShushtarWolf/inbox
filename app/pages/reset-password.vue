<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const router = useRouter()

const password = ref('')
const confirm = ref('')
const error = ref('')
const done = ref(false)
const submitting = ref(false)

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))

async function submit() {
  if (password.value !== confirm.value) {
    error.value = t('auth.passwordMismatch')
    return
  }
  submitting.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { token: token.value, password: password.value },
    })
    done.value = true
    setTimeout(() => router.push(localePath('/login')), 2000)
  } catch {
    error.value = t('auth.resetFailed')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm space-y-4 pt-8">
    <h1 class="font-display text-xl font-bold">{{ t('auth.resetPassword') }}</h1>
    <p v-if="done" class="text-sm font-bold text-brand-gray-600">{{ t('auth.resetSuccess') }}</p>
    <template v-else>
      <AppFormField :label="t('auth.newPassword')">
        <input v-model="password" type="password" class="neo-input" autocomplete="new-password" />
      </AppFormField>
      <AppFormField :label="t('auth.confirmPassword')">
        <input v-model="confirm" type="password" class="neo-input" autocomplete="new-password" />
      </AppFormField>
      <p v-if="error" class="venus-alert-error">{{ error }}</p>
      <button type="button" class="btn-primary w-full" :disabled="submitting || !token" @click="submit">
        {{ submitting ? t('common.loading') : t('auth.resetPassword') }}
      </button>
    </template>
    <NuxtLink :to="localePath('/login')" class="block text-center text-sm font-bold text-brand-navy underline">{{ t('auth.login') }}</NuxtLink>
  </div>
</template>
