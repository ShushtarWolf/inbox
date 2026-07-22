<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { fetch: fetchAuth } = useAuth()
const { openRegister, openLogin } = useAuthFlow()

const phone = ref('')
const code = ref('')
const step = ref<'phone' | 'otp'>('phone')
const submitting = ref(false)
const formError = ref('')
const debugCode = ref('')
const maskedPhone = ref('')
const smsMode = ref<'log' | 'live'>('log')

const returnTo = computed(() => {
  const value = route.query.returnTo
  return typeof value === 'string' ? value : ''
})

const queryError = computed(() => {
  if (route.query.error === 'invalid' || route.query.error === 'useGoogle') return t('auth.invalidCredentials')
  if (route.query.error === 'disabled') return t('auth.accountDisabled')
  if (route.query.error === 'google' || route.query.error === 'oauth') return t('auth.loginFailed')
  if (route.query.error === 'server') return t('auth.loginFailed')
  if (route.query.error === 'session') return t('auth.sessionExpired')
  return ''
})

const error = computed(() => formError.value || queryError.value)

async function requestOtp() {
  formError.value = ''
  if (!phone.value.trim()) {
    formError.value = t('auth.invalidPhone')
    return
  }
  submitting.value = true
  try {
    const data = await $fetch<{ phone: string; debugCode?: string; smsMode?: 'log' | 'live' }>('/api/auth/otp/request', {
      method: 'POST',
      body: { phone: phone.value, purpose: 'login' },
    })
    maskedPhone.value = data.phone
    debugCode.value = data.debugCode || ''
    code.value = data.debugCode || ''
    smsMode.value = data.smsMode === 'live' ? 'live' : 'log'
    step.value = 'otp'
  } catch (err: unknown) {
    const status = err && typeof err === 'object' && 'statusCode' in err
      ? (err as { statusCode?: number }).statusCode
      : undefined
    if (status === 404) formError.value = t('auth.phoneNotFound')
    else if (status === 400) formError.value = t('auth.invalidPhone')
    else if (status === 429) formError.value = t('errors.rateLimited')
    else if (status === 502) formError.value = t('auth.otpSendFailed')
    else formError.value = t('auth.otpSendFailed')
  } finally {
    submitting.value = false
  }
}

async function verifyOtp() {
  formError.value = ''
  submitting.value = true
  try {
    const data = await $fetch<{ redirectTo?: string }>('/api/auth/otp/verify', {
      method: 'POST',
      body: {
        phone: maskedPhone.value || phone.value,
        code: code.value,
        purpose: 'login',
        returnTo: returnTo.value || undefined,
      },
    })
    await fetchAuth()
    await navigateTo(data.redirectTo || localePath('/athlete'))
  } catch (err: unknown) {
    const status = err && typeof err === 'object' && 'statusCode' in err
      ? (err as { statusCode?: number }).statusCode
      : undefined
    if (status === 400) formError.value = t('auth.invalidOtp')
    else if (status === 403) formError.value = t('auth.accountDisabled')
    else if (status === 429) formError.value = t('errors.rateLimited')
    else formError.value = t('auth.otpVerifyFailed')
  } finally {
    submitting.value = false
  }
}

function backToPhone() {
  step.value = 'phone'
  formError.value = ''
  code.value = ''
  debugCode.value = ''
}
</script>

<template>
  <div class="mx-auto max-w-sm space-y-4 pt-8">
    <div class="text-center">
      <img src="/brand/inbox-logo-mark.svg" alt="" class="mx-auto h-12 w-12" />
      <h1 class="mt-3 font-display text-xl font-bold">{{ t('auth.loginToInbox') }}</h1>
      <p class="mt-1 text-sm text-brand-gray-600">{{ t('auth.phoneLoginHint') }}</p>
    </div>

    <p v-if="error" class="venus-alert-error">{{ error }}</p>

    <form v-if="step === 'phone'" class="venus-form-stack" @submit.prevent="requestOtp">
      <AppFormField field-id="login-phone" :label="t('common.mobile')" required>
        <input
          id="login-phone"
          v-model="phone"
          name="phone"
          type="tel"
          dir="ltr"
          inputmode="tel"
          class="neo-input"
          placeholder="09xxxxxxxxx"
          autocomplete="tel"
          required
        />
      </AppFormField>
      <button type="submit" class="btn-primary w-full py-3" :disabled="submitting">
        {{ submitting ? t('common.loading') : t('auth.continueConfirm') }}
      </button>
    </form>

    <form v-else class="venus-form-stack" @submit.prevent="verifyOtp">
      <p class="text-center text-sm text-brand-gray-600">
        {{ smsMode === 'live' ? t('auth.otpSentHint', { phone: maskedPhone }) : t('auth.otpLogModeHint', { phone: maskedPhone }) }}
      </p>
      <AppFormField field-id="login-otp" :label="t('auth.otpCode')" required>
        <input
          id="login-otp"
          v-model="code"
          name="otp"
          type="text"
          dir="ltr"
          inputmode="numeric"
          maxlength="6"
          class="neo-input text-center tracking-[0.35em]"
          autocomplete="one-time-code"
          required
        />
      </AppFormField>
      <p v-if="debugCode" class="rounded-lg bg-brand-primary-soft px-3 py-2 text-center text-xs font-bold text-brand-primary">
        {{ t('auth.debugOtpHint', { code: debugCode }) }}
      </p>
      <button type="submit" class="btn-primary w-full py-3" :disabled="submitting">
        {{ submitting ? t('common.loading') : t('auth.continueConfirm') }}
      </button>
      <button type="button" class="btn-ghost w-full" :disabled="submitting" @click="requestOtp">
        {{ t('auth.resendOtp') }}
      </button>
      <button type="button" class="btn-ghost w-full" @click="backToPhone">
        {{ t('common.back') }}
      </button>
    </form>

    <div class="space-y-2 border-t border-brand-gray-200 pt-4">
      <button type="button" class="btn-secondary w-full py-3" @click="openRegister({ returnTo: returnTo || undefined })">
        {{ t('auth.register') }}
      </button>
      <button
        type="button"
        class="btn-ghost w-full text-xs"
        @click="openLogin({ returnTo: returnTo || undefined, mode: 'password' })"
      >
        {{ t('auth.ownerPasswordFallback') }}
      </button>
    </div>
  </div>
</template>
