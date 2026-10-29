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
  <div class="canva-auth-sheet canva-authc flex min-h-dvh flex-col">
    <div class="mx-auto flex w-full max-w-[440px] flex-1 items-center px-4 py-10">
      <div class="canva-authbox canva-authbox-flush">
        <div class="canva-auth-accent" />
        <!-- LOCKED: logo RIGHT / action LEFT (RTL: logo first, action last) -->
        <div class="canva-auth-header">
          <InboxBrandLockup home-link height-class="h-7" />
          <button type="button" class="text-xs font-bold text-brand-gray-600" @click="goSmsLogin">
            {{ t('auth.loginWithPhone') }}
          </button>
        </div>

        <div class="canva-auth-body">
          <h1 class="canva-authbox-title text-start">{{ t('auth.resetPassword') }}</h1>
          <p class="canva-authbox-sub text-start">{{ t('auth.resetPreferPhoneHint') }}</p>

          <div v-if="done" class="space-y-3 text-center">
            <p class="text-sm font-bold text-brand-navy">{{ t('auth.resetSuccess') }}</p>
            <button type="button" class="canva-gate-btn-primary" @click="goLoginAfterReset">
              {{ t('auth.login') }}
            </button>
            <p class="forgot-auth-hint">
              <button type="button" class="forgot-auth-hint-link" @click="goSmsLogin">
                {{ t('auth.loginWithPhone') }}
              </button>
            </p>
          </div>

          <div v-else-if="invalidTokenState" class="space-y-3 text-center">
            <p class="venus-alert-error text-start">
              {{ missingToken ? t('auth.resetTokenMissing') : (error || t('auth.resetFailed')) }}
            </p>
            <NuxtLink :to="localePath('/forgot-password')" class="canva-gate-btn-primary block text-center">
              {{ t('auth.sendResetCode') }}
            </NuxtLink>
            <p class="forgot-auth-hint">
              <button type="button" class="forgot-auth-hint-link" @click="goSmsLogin">
                {{ t('auth.loginWithPhone') }}
              </button>
            </p>
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
            <p class="forgot-auth-hint">
              <button type="button" class="forgot-auth-hint-link" @click="goSmsLogin">
                {{ t('auth.loginWithPhone') }}
              </button>
            </p>
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

<style scoped>
/* SoT reset-password (same auth mock as forgot-password): label 11.5/#6b6b67/500; primary stays crimson when disabled; secondary = crimson text link */
:deep(.neo-form-field > label) {
  font-size: 11.5px;
  font-weight: 500;
  color: #6b6b67;
  margin-bottom: 6px;
}
:deep(.neo-input) {
  background: #fff;
}
.canva-authbox-sub {
  margin-bottom: 20px;
}
:deep(.canva-gate-btn-primary:disabled) {
  cursor: not-allowed;
  background: #c41e1e !important;
  color: #fff !important;
  opacity: 0.45;
  box-shadow: none;
  filter: none;
}
.forgot-auth-hint {
  margin-top: 14px;
  padding: 6px;
  text-align: center;
  font-size: 11.5px;
  color: #9a9a96;
}
.forgot-auth-hint-link {
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  font-size: 11.5px;
  font-weight: 500;
  color: #c41e1e;
  cursor: pointer;
  text-decoration: none;
}
.forgot-auth-hint-link:hover {
  text-decoration: underline;
}
</style>
