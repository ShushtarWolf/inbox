<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const { openLogin } = useAuthFlow()
const { fetchErrorMessage } = useFetchError()

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
    error.value = fetchErrorMessage(err, t('auth.resetRequestFailed'))
  } finally {
    pending.value = false
  }
}

function goSmsLogin() {
  openLogin()
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
        <h1 class="text-center text-lg font-bold text-brand-navy">{{ t('auth.forgotPassword') }}</h1>
        <p class="text-center text-sm text-brand-gray-600">{{ t('auth.resetPreferPhoneHint') }}</p>

        <div v-if="done" class="space-y-3 text-center">
          <p class="text-sm font-bold text-brand-navy">
            {{ emailMode === 'live' ? t('auth.resetEmailSent') : t('auth.resetEmailLogMode') }}
          </p>
          <p v-if="debugResetUrl" class="break-all rounded-sm border border-brand-primary/20 bg-brand-primary-soft px-3 py-2 text-start text-xs text-brand-primary" dir="ltr">
            {{ t('auth.debugResetHint') }}
            <a :href="debugResetUrl" class="font-bold underline">{{ debugResetUrl }}</a>
          </p>
          <button type="button" class="canva-gate-btn-primary" @click="goSmsLogin">
            {{ t('auth.loginWithPhone') }}
          </button>
          <NuxtLink :to="localePath('/')" class="canva-gate-btn-secondary block text-center">
            {{ t('common.back') }}
          </NuxtLink>
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
          <p v-if="error" class="venus-alert-error">{{ error }}</p>
          <button type="submit" class="canva-gate-btn-primary" :disabled="pending || !email.trim()">
            {{ pending ? t('common.loading') : t('auth.sendResetLink') }}
          </button>
          <button type="button" class="canva-gate-btn-secondary" @click="goSmsLogin">
            {{ t('auth.loginWithPhone') }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
