<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { fetch: fetchAuth } = useAuth()
const { openRegister, openLogin } = useAuthFlow()
const { pilotNoCoach } = usePilotFlags()

const name = ref('')
const phone = ref('')
const code = ref('')
const step = ref<'form' | 'otp'>('form')
const error = ref('')
const submitting = ref(false)
const debugCode = ref('')
const maskedPhone = ref('')
const smsMode = ref<'log' | 'live'>('log')

const returnTo = computed(() => {
  const value = route.query.returnTo
  return typeof value === 'string' ? value : ''
})

onMounted(() => {
  const role = route.query.role
  if (role === 'owner') {
    navigateTo(localePath({ path: '/register/owner', query: returnTo.value ? { returnTo: returnTo.value } : {} }))
    return
  }
  if (role === 'coach' && !pilotNoCoach.value) {
    navigateTo(localePath({ path: '/register/coach', query: returnTo.value ? { returnTo: returnTo.value } : {} }))
  }
})

async function requestOtp() {
  error.value = ''
  if (!name.value.trim()) {
    error.value = t('auth.registerFailed')
    return
  }
  if (!phone.value.trim()) {
    error.value = t('auth.invalidPhone')
    return
  }
  submitting.value = true
  try {
    const data = await $fetch<{ phone: string; debugCode?: string; smsMode?: 'log' | 'live' }>('/api/auth/otp/request', {
      method: 'POST',
      body: {
        phone: phone.value,
        purpose: 'register',
        role: 'ATHLETE',
        name: name.value.trim(),
      },
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
    if (status === 409) error.value = t('auth.phoneTaken')
    else if (status === 400) error.value = t('auth.invalidPhone')
    else if (status === 429) error.value = t('errors.rateLimited')
    else error.value = t('auth.otpSendFailed')
  } finally {
    submitting.value = false
  }
}

async function verifyOtp() {
  error.value = ''
  submitting.value = true
  try {
    const data = await $fetch<{ redirectTo?: string }>('/api/auth/otp/verify', {
      method: 'POST',
      body: {
        phone: maskedPhone.value || phone.value,
        code: code.value,
        purpose: 'register',
        returnTo: returnTo.value || undefined,
      },
    })
    await fetchAuth()
    await navigateTo(data.redirectTo || localePath('/athlete'))
  } catch (err: unknown) {
    const status = err && typeof err === 'object' && 'statusCode' in err
      ? (err as { statusCode?: number }).statusCode
      : undefined
    if (status === 400) error.value = t('auth.invalidOtp')
    else if (status === 429) error.value = t('errors.rateLimited')
    else error.value = t('auth.otpVerifyFailed')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-sm space-y-4 pt-8">
    <div class="text-center">
      <img src="/brand/inbox-logo-mark.svg" alt="" class="mx-auto h-12 w-12" />
      <h1 class="mt-3 font-display text-xl font-bold">{{ t('auth.registerAthleteTitle') }}</h1>
      <p class="mt-1 text-sm text-brand-gray-600">{{ t('register.athleteSubtitle') }}</p>
    </div>

    <RegisterRolePicker active="athlete" />

    <p v-if="error" class="venus-alert-error">{{ error }}</p>

    <form v-if="step === 'form'" class="venus-form-stack" @submit.prevent="requestOtp">
      <AppFormField field-id="register-name" :label="t('auth.fullName')" required>
        <input id="register-name" v-model="name" class="neo-input" autocomplete="name" required />
      </AppFormField>
      <AppFormField field-id="register-phone" :label="t('common.mobile')" required>
        <input
          id="register-phone"
          v-model="phone"
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
      <AppFormField field-id="register-otp" :label="t('auth.otpCode')" required>
        <input
          id="register-otp"
          v-model="code"
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
    </form>

    <div class="space-y-2 border-t border-brand-gray-200 pt-4">
      <button type="button" class="btn-ghost w-full" @click="openLogin({ returnTo: returnTo || undefined })">
        {{ t('auth.login') }}
      </button>
      <button type="button" class="btn-ghost w-full text-xs" @click="openRegister({ returnTo: returnTo || undefined, role: 'CLUB_ADMIN' })">
        {{ t('auth.registerOwnerTitle') }}
      </button>
    </div>
  </div>
</template>
