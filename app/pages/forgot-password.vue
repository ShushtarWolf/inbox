<script setup lang="ts">
/** Canva password-recovery / FA phone-auth sibling — real email recovery (not AuthFlow stub). */
definePageMeta({
  middleware: 'guest',
  layout: false,
})

const { t } = useI18n()
const localePath = useLocalePath()
const { openLogin } = useAuthFlow()
const { fetchErrorMessage } = useFetchError()

useHead({
  title: () => t('auth.forgotPasswordTitle'),
})

const email = ref('')
const pending = ref(false)
const error = ref('')
const done = ref(false)
const emailMode = ref<'log' | 'live'>('log')
const debugResetUrl = ref('')

async function submit() {
  error.value = ''
  pending.value = true
  try {
    const data = await $fetch<{
      ok: boolean
      emailMode?: 'log' | 'live'
      debugResetUrl?: string
    }>('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: email.value },
    })
    emailMode.value = data.emailMode === 'live' ? 'live' : 'log'
    debugResetUrl.value = data.debugResetUrl || ''
    done.value = true
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    error.value = status === 429
      ? t('errors.rateLimited')
      : fetchErrorMessage(err, t('auth.resetRequestFailed'))
  } finally {
    pending.value = false
  }
}

async function goSmsLogin() {
  openLogin()
  await navigateTo(localePath('/'))
}

function tryAgain() {
  done.value = false
  debugResetUrl.value = ''
  error.value = ''
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
          <h1 class="text-center text-lg font-bold text-brand-navy">{{ t('auth.forgotPasswordTitle') }}</h1>
          <p class="text-center text-sm text-brand-gray-600">{{ t('auth.resetPreferPhoneHint') }}</p>

          <div v-if="done" class="space-y-3 text-center">
            <p class="text-sm font-bold text-brand-navy">
              {{ emailMode === 'live' ? t('auth.resetEmailSent') : t('auth.resetEmailLogMode') }}
            </p>
            <p
              v-if="debugResetUrl"
              class="break-all border border-brand-primary/20 bg-brand-primary-soft px-3 py-2 text-start text-xs text-brand-primary"
              style="border-radius: 2px;"
              dir="ltr"
            >
              {{ t('auth.debugResetHint') }}
              <a :href="debugResetUrl" class="font-bold underline">{{ debugResetUrl }}</a>
            </p>
            <button type="button" class="canva-gate-btn-primary" @click="goSmsLogin">
              {{ t('auth.loginWithPhone') }}
            </button>
            <button type="button" class="canva-gate-btn-secondary" @click="tryAgain">
              {{ t('auth.sendResetLink') }}
            </button>
          </div>

          <form v-else class="space-y-4" @submit.prevent="submit">
            <AppFormField field-id="forgot-email" :label="t('auth.email')">
              <input
                id="forgot-email"
                v-model="email"
                type="email"
                required
                dir="ltr"
                autocomplete="email"
                class="neo-input bg-white/95"
                :placeholder="t('auth.email')"
              />
            </AppFormField>
            <p v-if="error" class="venus-alert-error text-start">{{ error }}</p>
            <button type="submit" class="canva-gate-btn-primary" :disabled="pending || !email.trim()">
              {{ pending ? t('common.loading') : t('auth.sendResetLink') }}
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
