<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { openLogin } = useAuthFlow()
const { fetchErrorMessage } = useFetchError()

const token = computed(() => {
  const value = route.query.token
  return typeof value === 'string' ? value : ''
})

const password = ref('')
const confirmPassword = ref('')
const pending = ref(false)
const error = ref('')
const done = ref(false)

const missingToken = computed(() => !token.value)

async function submit() {
  error.value = ''
  if (missingToken.value) {
    error.value = t('auth.resetFailed')
    return
  }
  if (password.value.length < 6) {
    error.value = t('auth.passwordTooShort')
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = t('auth.passwordMismatch')
    return
  }

  pending.value = true
  try {
    await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { token: token.value, password: password.value },
    })
    done.value = true
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    error.value = status === 400
      ? t('auth.resetFailed')
      : fetchErrorMessage(err, t('auth.resetFailed'))
  } finally {
    pending.value = false
  }
}

function goSmsLogin() {
  openLogin()
  navigateTo(localePath('/'))
}

function goLoginAfterReset() {
  openLogin({ notice: t('auth.resetSuccess') })
  navigateTo(localePath('/'))
}
</script>

<template>
  <div class="mx-auto flex min-h-[70vh] w-full max-w-sm items-center px-4 py-8">
    <div class="canva-result-sheet w-full p-0">
      <div class="canva-auth-accent" />
      <div class="canva-auth-header">
        <button type="button" class="text-xs font-bold text-brand-gray-600" @click="goSmsLogin">
          {{ t('auth.loginWithPhone') }}
        </button>
        <div class="flex items-center gap-2">
          <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7" />
          <span class="font-display text-base font-bold tracking-wide text-brand-navy">INBOX</span>
        </div>
        <span class="w-8" />
      </div>

      <div class="canva-auth-body">
        <h1 class="text-center text-lg font-bold text-brand-navy">{{ t('auth.resetPassword') }}</h1>
        <p class="text-center text-sm text-brand-gray-600">{{ t('auth.resetPreferPhoneHint') }}</p>

        <div v-if="done" class="space-y-3 text-center">
          <p class="text-sm font-bold text-brand-navy">{{ t('auth.resetSuccess') }}</p>
          <button type="button" class="canva-gate-btn-primary" @click="goLoginAfterReset">
            {{ t('auth.login') }}
          </button>
          <button type="button" class="canva-gate-btn-secondary" @click="goSmsLogin">
            {{ t('auth.loginWithPhone') }}
          </button>
        </div>

        <div v-else-if="missingToken" class="space-y-3 text-center">
          <p class="venus-alert-error">{{ t('auth.resetFailed') }}</p>
          <NuxtLink :to="localePath('/forgot-password')" class="canva-gate-btn-primary block text-center">
            {{ t('auth.sendResetLink') }}
          </NuxtLink>
          <button type="button" class="canva-gate-btn-secondary" @click="goSmsLogin">
            {{ t('auth.loginWithPhone') }}
          </button>
        </div>

        <form v-else class="space-y-4" @submit.prevent="submit">
          <AppFormField field-id="reset-password" :label="t('auth.newPassword')">
            <input
              id="reset-password"
              v-model="password"
              type="password"
              required
              minlength="6"
              autocomplete="new-password"
              class="neo-input bg-white/95"
            />
          </AppFormField>
          <AppFormField field-id="reset-password-confirm" :label="t('auth.confirmPassword')">
            <input
              id="reset-password-confirm"
              v-model="confirmPassword"
              type="password"
              required
              minlength="6"
              autocomplete="new-password"
              class="neo-input bg-white/95"
            />
          </AppFormField>
          <p v-if="error" class="venus-alert-error">{{ error }}</p>
          <button type="submit" class="canva-gate-btn-primary" :disabled="pending">
            {{ pending ? t('common.loading') : t('auth.resetPassword') }}
          </button>
          <button type="button" class="canva-gate-btn-secondary" @click="goSmsLogin">
            {{ t('auth.loginWithPhone') }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
