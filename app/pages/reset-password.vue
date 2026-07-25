<script setup lang="ts">
/** Canva password-reset / FA phone-auth sibling — real token reset (not stub redirect). */
definePageMeta({
  middleware: 'guest',
  layout: false,
})

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { openLogin } = useAuthFlow()
const { fetchErrorMessage } = useFetchError()

useHead({
  title: () => t('auth.resetPassword'),
})

const token = computed(() => {
  const value = route.query.token
  return typeof value === 'string' ? value.trim() : ''
})

const password = ref('')
const confirmPassword = ref('')
const pending = ref(false)
const error = ref('')
const done = ref(false)
/** True after API rejects token as invalid/expired (not merely missing query). */
const tokenRejected = ref(false)

const missingToken = computed(() => !token.value)
const invalidTokenState = computed(() => missingToken.value || tokenRejected.value)

async function submit() {
  error.value = ''
  if (missingToken.value) {
    tokenRejected.value = true
    error.value = t('auth.resetTokenMissing')
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
    tokenRejected.value = false
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 400) {
      tokenRejected.value = true
      error.value = t('auth.resetFailed')
    } else if (status === 429) {
      error.value = t('errors.rateLimited')
    } else {
      error.value = fetchErrorMessage(err, t('auth.resetFailed'))
    }
  } finally {
    pending.value = false
  }
}

async function goSmsLogin() {
  openLogin()
  await navigateTo(localePath('/'))
}

async function goLoginAfterReset() {
  openLogin({ notice: t('auth.resetSuccess') })
  await navigateTo(localePath('/login'))
}
</script>

<template>
  <div class="canva-auth-sheet flex min-h-dvh flex-col">
    <div class="mx-auto flex w-full max-w-sm flex-1 items-center px-4 py-8">
      <div class="canva-result-sheet w-full p-0">
        <div class="canva-auth-accent" />
        <!-- LOCKED: logo RIGHT / action LEFT (RTL: logo first, action last) -->
        <div class="canva-auth-header">
          <div class="flex items-center gap-2">
            <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7" />
            <span class="font-display text-base font-bold tracking-wide text-brand-navy">INBOX</span>
          </div>
          <button type="button" class="text-xs font-bold text-brand-gray-600" @click="goSmsLogin">
            {{ t('auth.loginWithPhone') }}
          </button>
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

          <div v-else-if="invalidTokenState" class="space-y-3 text-center">
            <p class="venus-alert-error text-start">
              {{ missingToken ? t('auth.resetTokenMissing') : (error || t('auth.resetFailed')) }}
            </p>
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
            <p v-if="error" class="venus-alert-error text-start">{{ error }}</p>
            <button
              type="submit"
              class="canva-gate-btn-primary"
              :disabled="pending || !password || !confirmPassword"
            >
              {{ pending ? t('common.loading') : t('auth.resetPassword') }}
            </button>
            <button type="button" class="canva-gate-btn-secondary" @click="goSmsLogin">
              {{ t('auth.loginWithPhone') }}
            </button>
          </form>

          <nav class="canva-legal-footer justify-center pt-2" :aria-label="t('legal.privacy')">
            <NuxtLink :to="localePath('/privacy')" class="hover:text-brand-primary">{{ t('legal.privacy') }}</NuxtLink>
            <span class="text-brand-gray-300" aria-hidden="true">·</span>
            <NuxtLink :to="localePath('/terms')" class="hover:text-brand-primary">{{ t('legal.terms') }}</NuxtLink>
          </nav>
        </div>
      </div>
    </div>
  </div>
</template>
