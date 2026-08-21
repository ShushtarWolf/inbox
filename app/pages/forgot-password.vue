<script setup lang="ts">
/** Canva password recovery — SMS OTP (no email). */
import { startSmsOtpAutofill } from '~/composables/useSmsOtpAutofill'

definePageMeta({
  middleware: 'guest',
  layout: false,
})

const { t } = useI18n()
const localePath = useLocalePath()
const { openLogin } = useAuthFlow()
const { fetchErrorMessage } = useFetchError()
const { smsMode } = useSmsCapability()

useHead({
  title: () => t('auth.forgotPasswordTitle'),
})

type Step = 'phone' | 'reset' | 'done'

const step = ref<Step>('phone')
const phone = ref('')
const code = ref('')
const password = ref('')
const confirmPassword = ref('')
const pending = ref(false)
const error = ref('')
const normalizedPhone = ref('')
const debugCode = ref('')

async function requestCode() {
  error.value = ''
  pending.value = true
  try {
    const data = await $fetch<{
      ok: boolean
      phone?: string
      expiresIn?: number
      debugCode?: string
      smsMode?: 'log' | 'live'
    }>('/api/auth/forgot-password', {
      method: 'POST',
      body: { phone: phone.value },
    })
    normalizedPhone.value = data.phone || phone.value
    debugCode.value = data.debugCode || ''
    if (data.smsMode === 'log' && data.debugCode) {
      code.value = data.debugCode
    } else {
      code.value = ''
    }
    step.value = 'reset'
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 404) {
      error.value = t('auth.phoneNotFound')
    } else if (status === 429) {
      error.value = t('errors.rateLimited')
    } else {
      error.value = fetchErrorMessage(err, t('auth.resetRequestFailed'))
    }
  } finally {
    pending.value = false
  }
}

async function submitReset() {
  error.value = ''
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
      body: {
        phone: normalizedPhone.value || phone.value,
        code: code.value,
        password: password.value,
      },
    })
    step.value = 'done'
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 400) {
      error.value = t('auth.invalidOtp')
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

function backToPhone() {
  step.value = 'phone'
  code.value = ''
  password.value = ''
  confirmPassword.value = ''
  debugCode.value = ''
  error.value = ''
}

let stopSmsOtpAutofill = () => {}

function restartSmsOtpAutofill() {
  stopSmsOtpAutofill()
  stopSmsOtpAutofill = () => {}
  if (step.value !== 'reset' || debugCode.value) return
  stopSmsOtpAutofill = startSmsOtpAutofill((next) => {
    if (code.value.replace(/\D/g, '').length < 6) code.value = next
  })
}

watch(step, restartSmsOtpAutofill)

onUnmounted(() => {
  stopSmsOtpAutofill()
})
</script>

<template>
  <div class="canva-auth-sheet flex min-h-dvh flex-col">
    <div class="mx-auto flex w-full max-w-sm flex-1 items-center px-4 py-8">
      <div class="canva-result-sheet w-full p-0">
        <div class="canva-auth-accent" />
        <!-- LOCKED: logo RIGHT / action LEFT (RTL: logo first, action last) -->
        <div class="canva-auth-header">
          <NuxtLink :to="localePath('/')" class="flex items-center gap-2" :aria-label="t('brand.name')">
            <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7" />
            <InboxWordmark class="text-base text-brand-navy" />
          </NuxtLink>
          <button type="button" class="text-xs font-bold text-brand-gray-600" @click="goSmsLogin">
            {{ t('auth.loginWithPhone') }}
          </button>
        </div>

        <div class="canva-auth-body">
          <h1 class="text-center text-lg font-bold text-brand-navy">{{ t('auth.forgotPasswordTitle') }}</h1>
          <p class="text-center text-sm text-brand-gray-600">{{ t('auth.resetPreferPhoneHint') }}</p>

          <div v-if="step === 'done'" class="space-y-3 text-center">
            <p class="text-sm font-bold text-brand-navy">{{ t('auth.resetSuccess') }}</p>
            <button type="button" class="canva-gate-btn-primary" @click="goLoginAfterReset">
              {{ t('auth.login') }}
            </button>
            <button type="button" class="canva-gate-btn-secondary" @click="goSmsLogin">
              {{ t('auth.loginWithPhone') }}
            </button>
          </div>

          <form v-else-if="step === 'reset'" class="space-y-4" @submit.prevent="submitReset">
            <p class="text-center text-sm text-brand-gray-600">
              {{ t('auth.otpSentHint', { phone: normalizedPhone }) }}
            </p>
            <p
              v-if="smsMode === 'log' || debugCode"
              class="border border-amber-200 bg-amber-50 px-3 py-2 text-start text-xs font-bold text-amber-900"
              style="border-radius: 2px;"
            >
              {{ t('auth.otpLogModeBanner') }}
              <span v-if="debugCode" class="ms-1 font-mono" dir="ltr">{{ debugCode }}</span>
            </p>
            <AppFormField field-id="reset-otp" :label="t('auth.otpCode')" numeric>
              <input
                id="reset-otp"
                v-model="code"
                dir="ltr"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="6"
                required
                class="neo-input bg-white/95"
              />
            </AppFormField>
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
              :disabled="pending || !code.trim() || !password || !confirmPassword"
            >
              {{ pending ? t('common.loading') : t('auth.resetPassword') }}
            </button>
            <button type="button" class="canva-gate-btn-secondary" @click="backToPhone">
              {{ t('auth.sendResetCode') }}
            </button>
          </form>

          <form v-else class="space-y-4" @submit.prevent="requestCode">
            <AppFormField field-id="forgot-phone" :label="t('common.mobile')" numeric>
              <input
                id="forgot-phone"
                v-model="phone"
                dir="ltr"
                inputmode="tel"
                autocomplete="tel"
                required
                class="neo-input bg-white/95"
                :placeholder="t('auth.phonePlaceholder')"
              />
            </AppFormField>
            <p v-if="error" class="venus-alert-error text-start">{{ error }}</p>
            <button type="submit" class="canva-gate-btn-primary" :disabled="pending || !phone.trim()">
              {{ pending ? t('common.loading') : t('auth.sendResetCode') }}
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
