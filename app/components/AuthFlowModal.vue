<script setup lang="ts">
import type { AuthFlowRole } from '~/composables/useAuthFlow'
import { isAuthProtectedPath } from '#shared/returnTo.ts'

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { fetch: fetchAuth } = useAuth()
const {
  open,
  step,
  role,
  purpose,
  channel,
  returnTo,
  notice,
  close,
} = useAuthFlow()

const name = ref('')
const phone = ref('')
const email = ref('')
const identifier = ref('')
const password = ref('')
const clubNameFa = ref('')
const code = ref('')
const pending = ref(false)
const error = ref('')
const debugCode = ref('')
const maskedPhone = ref('')

const { smsMode, smsPhase, smsLive } = useSmsCapability()

const allRoles: Array<{ id: AuthFlowRole; title: string; body: string; icon: string }> = [
  { id: 'ATHLETE', title: 'register.roleAthlete', body: 'auth.roleAthleteHint', icon: 'sports_tennis' },
  { id: 'CLUB_ADMIN', title: 'register.roleOwner', body: 'auth.roleOwnerHint', icon: 'apartment' },
]

/** Product exclusion: Coach role is never offered in AuthFlow. */
const roles = computed(() => allRoles)

const title = computed(() => {
  if (step.value === 'gate') return t('auth.gateTitle')
  if (step.value === 'role') return t('auth.roleTitle')
  if (step.value === 'login') {
    return channel.value === 'otp' ? t('auth.loginWithPhone') : t('auth.loginToInbox')
  }
  if (step.value === 'otp') return t('auth.otpTitle')
  if (role.value === 'CLUB_ADMIN') return t('auth.registerOwnerTitle')
  return t('auth.registerAthleteTitle')
})

const otpHint = computed(() => {
  if (smsMode.value === 'live' && smsPhase.value === 'MULTI') {
    return t('auth.otpSentHint', { phone: maskedPhone.value })
  }
  if (smsMode.value === 'live' && smsPhase.value === 'SINGLE') {
    return t('auth.otpSingleLiveHint', { phone: maskedPhone.value })
  }
  return t('auth.otpLogModeHint', { phone: maskedPhone.value })
})

const safeReturnTo = computed(
  () => returnTo.value || (typeof route.query.returnTo === 'string' ? route.query.returnTo : ''),
)

function resetForm() {
  name.value = ''
  phone.value = ''
  email.value = ''
  identifier.value = ''
  password.value = ''
  clubNameFa.value = ''
  code.value = ''
  error.value = ''
  debugCode.value = ''
  maskedPhone.value = ''
  pending.value = false
}

function handleClose() {
  resetForm()
  close()
}

async function goForgotPassword() {
  resetForm()
  close()
  await navigateTo(localePath('/forgot-password'))
}

function goGate() {
  resetForm()
  purpose.value = 'login'
  channel.value = 'password'
  step.value = 'gate'
}

function goLogin() {
  resetForm()
  purpose.value = 'login'
  channel.value = 'password'
  step.value = 'login'
}

function goLoginOtp() {
  error.value = ''
  purpose.value = 'login'
  channel.value = 'otp'
  step.value = 'login'
}

function goLoginPassword() {
  error.value = ''
  purpose.value = 'login'
  channel.value = 'password'
  step.value = 'login'
}

function goRole() {
  resetForm()
  purpose.value = 'register'
  channel.value = 'password'
  step.value = 'role'
}

function selectRole(next: AuthFlowRole) {
  role.value = next
  purpose.value = 'register'
  channel.value = 'password'
  step.value = 'register'
}

function goRegisterOtp() {
  error.value = ''
  channel.value = 'otp'
}

function goRegisterPassword() {
  error.value = ''
  channel.value = 'password'
}

async function loginWithPassword() {
  error.value = ''
  pending.value = true
  try {
    const data = await $fetch<{ redirectTo?: string }>('/api/auth/login', {
      method: 'POST',
      body: {
        email: identifier.value,
        password: password.value,
        returnTo: safeReturnTo.value,
      },
    })
    await fetchAuth()
    handleClose()
    await navigateTo(data.redirectTo || localePath('/'))
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 403) error.value = t('auth.accountDisabled')
    else if (status === 401 || status === 400) error.value = t('auth.invalidCredentials')
    else error.value = t('auth.loginFailed')
  } finally {
    pending.value = false
  }
}

async function registerWithPassword() {
  error.value = ''
  if (!name.value.trim() || password.value.length < 6 || (!phone.value.trim() && !email.value.trim())) {
    error.value = t('auth.registerIdentityRequired')
    return
  }
  if (role.value === 'CLUB_ADMIN' && !clubNameFa.value.trim()) {
    error.value = t('auth.registerIdentityRequired')
    return
  }
  pending.value = true
  try {
    const returnPath = safeReturnTo.value
    if (role.value === 'CLUB_ADMIN') {
      const data = await $fetch<{ redirectTo?: string }>('/api/auth/register-owner', {
        method: 'POST',
        body: {
          name: name.value,
          phone: phone.value || undefined,
          email: email.value || undefined,
          password: password.value,
          clubNameFa: clubNameFa.value,
          city: 'تهران',
          returnTo: returnPath,
        },
      })
      await fetchAuth()
      handleClose()
      await navigateTo(data.redirectTo || localePath('/owner/calendar'))
      return
    }

    const data = await $fetch<{ redirectTo?: string }>('/api/auth/register', {
      method: 'POST',
      body: {
        name: name.value,
        phone: phone.value || undefined,
        email: email.value || undefined,
        password: password.value,
        returnTo: returnPath,
      },
    })
    await fetchAuth()
    handleClose()
    await navigateTo(data.redirectTo || localePath('/'))
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    const message = String((err as { statusMessage?: string; data?: { statusMessage?: string } })?.statusMessage
      || (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      || '')
    if (status === 409 && /phone/i.test(message)) error.value = t('auth.phoneTaken')
    else if (status === 409) error.value = t('auth.emailTaken')
    else if (status === 400 && /phone/i.test(message)) error.value = t('auth.invalidPhone')
    else if (status === 400) error.value = t('auth.registerIdentityRequired')
    else if (status === 429) error.value = t('errors.rateLimited')
    else error.value = t('auth.registerFailed')
  } finally {
    pending.value = false
  }
}

async function requestOtp() {
  error.value = ''
  pending.value = true
  try {
    const data = await $fetch<{
      phone: string
      debugCode?: string
      smsMode?: 'log' | 'live' | 'bypass'
      smsPhase?: 'SINGLE' | 'MULTI'
      bypass?: boolean
      redirectTo?: string
    }>('/api/auth/otp/request', {
      method: 'POST',
      body: {
        phone: phone.value,
        purpose: purpose.value,
        role: purpose.value === 'register' ? role.value : undefined,
        name: purpose.value === 'register' ? name.value : undefined,
        clubNameFa: purpose.value === 'register' && role.value === 'CLUB_ADMIN' ? clubNameFa.value : undefined,
        returnTo: safeReturnTo.value,
      },
    })

    if (data.bypass) {
      await fetchAuth()
      notice.value = t('auth.otpBypassNotice')
      pending.value = false
      await new Promise((resolve) => setTimeout(resolve, 900))
      handleClose()
      await navigateTo(data.redirectTo || localePath('/'))
      return
    }

    maskedPhone.value = data.phone
    debugCode.value = data.debugCode || ''
    // Prefill only in log/dry-run so local testing works; never imply a real SMS was sent.
    code.value = data.smsMode === 'log' || data.smsMode === 'bypass' ? (data.debugCode || '') : ''
    step.value = 'otp'
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 404) error.value = t('auth.phoneNotFound')
    else if (status === 409) error.value = t('auth.phoneTaken')
    else if (status === 400) error.value = t('auth.invalidPhone')
    else if (status === 429) error.value = t('errors.rateLimited')
    else if (status === 503 || status === 500) error.value = t('auth.otpServerUnavailable')
    else error.value = t('auth.otpSendFailed')
  } finally {
    pending.value = false
  }
}

async function verifyOtp() {
  error.value = ''
  pending.value = true
  try {
    const data = await $fetch<{ redirectTo?: string }>('/api/auth/otp/verify', {
      method: 'POST',
      body: {
        phone: maskedPhone.value || phone.value,
        code: code.value,
        purpose: purpose.value,
        returnTo: safeReturnTo.value,
      },
    })
    await fetchAuth()
    handleClose()
    await navigateTo(data.redirectTo || localePath('/'))
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 400) error.value = t('auth.invalidOtp')
    else if (status === 429) error.value = t('errors.rateLimited')
    else error.value = t('auth.otpVerifyFailed')
  } finally {
    pending.value = false
  }
}

watch(open, (isOpen) => {
  if (!isOpen) resetForm()
})

// Dismiss leftover session notice when user navigates to a public page (e.g. club detail)
watch(
  () => route.fullPath,
  (next, prev) => {
    if (!open.value || !notice.value || next === prev) return
    const path = next.split('?')[0] || next
    if (path.endsWith('/login')) return
    if (!isAuthProtectedPath(path)) handleClose()
  },
)
</script>

<template>
  <AppModal :open="open" patterned max-width-class="max-w-sm" @close="handleClose">
    <div class="relative z-[1]">
      <div class="canva-auth-accent" />
      <div class="canva-auth-header">
        <button type="button" class="text-xs font-bold text-brand-gray-600" @click="handleClose">
          {{ t('common.close') }}
        </button>
        <div class="flex items-center gap-2">
          <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7" />
          <span class="font-display text-base font-bold tracking-wide text-brand-navy">INBOX</span>
        </div>
        <span class="w-8" />
      </div>

      <div class="canva-auth-body">
        <h2 class="text-center text-lg font-bold text-brand-navy">{{ title }}</h2>
        <p
          v-if="notice"
          class="border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-bold text-amber-900 text-start"
          style="border-radius: var(--sz-canva-radius);"
        >
          {{ notice }}
        </p>

        <template v-if="step === 'gate'">
          <p class="text-center text-sm text-brand-gray-600">{{ t('home.roleTileGuest') }}</p>
          <p
            v-if="!smsLive"
            class="border border-brand-gray-200 bg-white/80 px-3 py-2 text-start text-xs text-brand-gray-600"
            style="border-radius: var(--sz-canva-radius);"
          >
            {{ t('auth.otpUnavailableUsePassword') }}
          </p>
          <button type="button" class="canva-gate-btn-primary" @click="goRole">
            {{ t('auth.register') }}
          </button>
          <button type="button" class="canva-gate-btn-secondary" @click="goLogin">
            {{ t('auth.login') }}
          </button>
        </template>

        <template v-else-if="step === 'role'">
          <p class="text-center text-sm text-brand-gray-600">{{ t('auth.roleSubtitle') }}</p>
          <button
            v-for="item in roles"
            :key="item.id"
            type="button"
            class="canva-role-card"
            @click="selectRole(item.id)"
          >
            <div class="venus-icon-wrap venus-icon-wrap-sm bg-brand-primary-soft text-brand-primary">
              <AppIcon :name="item.icon" size="sm" />
            </div>
            <div class="min-w-0 flex-1 text-start">
              <p class="font-bold text-brand-navy">{{ t(item.title) }}</p>
              <p class="mt-0.5 text-xs text-brand-gray-600">{{ t(item.body) }}</p>
            </div>
          </button>
          <button type="button" class="canva-gate-btn-secondary" @click="goGate">
            {{ t('common.back') }}
          </button>
        </template>

        <!-- Password register (MVP primary) -->
        <form
          v-else-if="step === 'register' && channel === 'password'"
          class="space-y-4"
          @submit.prevent="registerWithPassword"
        >
          <p
            v-if="!smsLive"
            class="border border-brand-gray-200 bg-white/80 px-3 py-2 text-start text-xs text-brand-gray-600"
            style="border-radius: var(--sz-canva-radius);"
          >
            {{ t('auth.registerPasswordHint') }}
          </p>
          <p v-else class="text-center text-sm text-brand-gray-600">{{ t('auth.registerPasswordHint') }}</p>
          <AppFormField
            field-id="auth-name"
            :label="role === 'CLUB_ADMIN' ? t('auth.ownerContactName') : t('auth.fullName')"
          >
            <input id="auth-name" v-model="name" class="neo-input bg-white/95" autocomplete="name" required />
          </AppFormField>
          <AppFormField
            v-if="role === 'CLUB_ADMIN'"
            field-id="auth-club"
            :label="t('register.clubNameFa')"
          >
            <input id="auth-club" v-model="clubNameFa" class="neo-input bg-white/95" required />
          </AppFormField>
          <AppFormField field-id="auth-phone" :label="t('common.mobile')">
            <input
              id="auth-phone"
              v-model="phone"
              dir="ltr"
              inputmode="tel"
              class="neo-input bg-white/95"
              placeholder="09xxxxxxxxx"
              autocomplete="tel"
            />
          </AppFormField>
          <AppFormField field-id="auth-email" :label="t('auth.emailOptional')">
            <input
              id="auth-email"
              v-model="email"
              dir="ltr"
              type="email"
              class="neo-input bg-white/95"
              autocomplete="email"
            />
          </AppFormField>
          <AppFormField field-id="auth-password" :label="t('auth.password')">
            <input
              id="auth-password"
              v-model="password"
              type="password"
              class="neo-input bg-white/95"
              autocomplete="new-password"
              required
              minlength="6"
            />
          </AppFormField>
          <p v-if="error" class="venus-alert-error text-start">{{ error }}</p>
          <button type="submit" class="canva-gate-btn-primary" :disabled="pending">
            {{ pending ? t('common.loading') : t('auth.continueConfirm') }}
          </button>
          <button
            v-if="smsLive"
            type="button"
            class="canva-gate-btn-secondary"
            @click="goRegisterOtp"
          >
            {{ t('auth.registerWithPhone') }}
          </button>
          <button
            v-else
            type="button"
            class="block w-full text-center text-xs font-bold text-brand-gray-600 underline"
            @click="goRegisterOtp"
          >
            {{ t('auth.otpDevOnlyLink') }}
          </button>
          <button type="button" class="canva-gate-btn-secondary" @click="goRole()">
            {{ t('common.back') }}
          </button>
        </form>

        <!-- OTP register (kept for live SMS / local dry-run) -->
        <form
          v-else-if="step === 'register' && channel === 'otp'"
          class="space-y-4"
          @submit.prevent="requestOtp"
        >
          <p
            class="border border-amber-200 bg-amber-50 px-3 py-2 text-start text-xs font-bold text-amber-900"
            style="border-radius: var(--sz-canva-radius);"
          >
            {{ smsLive ? t('auth.phoneLoginHintMulti') : t('auth.otpUnavailableUsePassword') }}
          </p>
          <AppFormField
            field-id="auth-otp-name"
            :label="role === 'CLUB_ADMIN' ? t('auth.ownerContactName') : t('auth.fullName')"
          >
            <input id="auth-otp-name" v-model="name" class="neo-input bg-white/95" autocomplete="name" required />
          </AppFormField>
          <AppFormField
            v-if="role === 'CLUB_ADMIN'"
            field-id="auth-otp-club"
            :label="t('register.clubNameFa')"
          >
            <input id="auth-otp-club" v-model="clubNameFa" class="neo-input bg-white/95" required />
          </AppFormField>
          <AppFormField field-id="auth-otp-phone" :label="t('common.mobile')">
            <input
              id="auth-otp-phone"
              v-model="phone"
              dir="ltr"
              inputmode="tel"
              class="neo-input bg-white/95"
              placeholder="09xxxxxxxxx"
              autocomplete="tel"
              required
            />
          </AppFormField>
          <p v-if="error" class="venus-alert-error text-start">{{ error }}</p>
          <button type="submit" class="canva-gate-btn-primary" :disabled="pending">
            {{ pending ? t('common.loading') : t('auth.continueConfirm') }}
          </button>
          <button type="button" class="canva-gate-btn-secondary" @click="goRegisterPassword">
            {{ t('auth.registerWithPassword') }}
          </button>
          <button type="button" class="canva-gate-btn-secondary" @click="goRole()">
            {{ t('common.back') }}
          </button>
        </form>

        <!-- Password login (MVP primary) -->
        <form
          v-else-if="step === 'login' && channel === 'password'"
          class="space-y-4"
          @submit.prevent="loginWithPassword"
        >
          <p
            v-if="!smsLive"
            class="border border-brand-gray-200 bg-white/80 px-3 py-2 text-start text-xs text-brand-gray-600"
            style="border-radius: var(--sz-canva-radius);"
          >
            {{ t('auth.otpUnavailableUsePassword') }}
          </p>
          <p v-else class="text-center text-sm text-brand-gray-600">{{ t('auth.emailOrPhonePasswordHint') }}</p>
          <AppFormField field-id="login-identifier" :label="t('auth.emailOrPhone')">
            <input
              id="login-identifier"
              v-model="identifier"
              dir="ltr"
              class="neo-input bg-white/95"
              autocomplete="username"
              required
            />
          </AppFormField>
          <AppFormField field-id="login-password" :label="t('auth.password')">
            <input
              id="login-password"
              v-model="password"
              type="password"
              class="neo-input bg-white/95"
              autocomplete="current-password"
              required
            />
          </AppFormField>
          <p v-if="error" class="venus-alert-error text-start">{{ error }}</p>
          <button type="submit" class="canva-gate-btn-primary" :disabled="pending">
            {{ pending ? t('common.loading') : t('auth.login') }}
          </button>
          <button
            type="button"
            class="block w-full text-center text-xs font-bold text-brand-primary underline"
            @click="goForgotPassword"
          >
            {{ t('auth.forgotPassword') }}
          </button>
          <button
            v-if="smsLive"
            type="button"
            class="canva-gate-btn-secondary"
            @click="goLoginOtp"
          >
            {{ t('auth.loginWithPhone') }}
          </button>
          <button
            v-else
            type="button"
            class="block w-full text-center text-xs font-bold text-brand-gray-600 underline"
            @click="goLoginOtp"
          >
            {{ t('auth.otpDevOnlyLink') }}
          </button>
          <button type="button" class="canva-gate-btn-secondary" @click="goRole">
            {{ t('auth.register') }}
          </button>
          <button type="button" class="canva-gate-btn-secondary" @click="goGate">
            {{ t('common.back') }}
          </button>
        </form>

        <!-- OTP login request -->
        <form
          v-else-if="step === 'login' && channel === 'otp'"
          class="space-y-4"
          @submit.prevent="requestOtp"
        >
          <p
            class="border border-amber-200 bg-amber-50 px-3 py-2 text-start text-xs font-bold text-amber-900"
            style="border-radius: var(--sz-canva-radius);"
          >
            {{ smsLive ? t('auth.phoneLoginHintMulti') : t('auth.otpUnavailableUsePassword') }}
          </p>
          <AppFormField field-id="login-phone" :label="t('common.mobile')">
            <input
              id="login-phone"
              v-model="phone"
              dir="ltr"
              inputmode="tel"
              class="neo-input bg-white/95"
              placeholder="09xxxxxxxxx"
              autocomplete="tel"
              required
            />
          </AppFormField>
          <p v-if="error" class="venus-alert-error text-start">{{ error }}</p>
          <button type="submit" class="canva-gate-btn-primary" :disabled="pending">
            {{ pending ? t('common.loading') : t('auth.continueConfirm') }}
          </button>
          <button type="button" class="canva-gate-btn-secondary" @click="goLoginPassword">
            {{ t('auth.loginWithPassword') }}
          </button>
          <button type="button" class="canva-gate-btn-secondary" @click="goGate">
            {{ t('common.back') }}
          </button>
        </form>

        <form v-else-if="step === 'otp'" class="space-y-4" @submit.prevent="verifyOtp">
          <p class="text-start text-sm text-brand-gray-600">
            {{ otpHint }}
          </p>
          <AppFormField field-id="login-otp" :label="t('auth.otpCode')">
            <input
              id="login-otp"
              v-model="code"
              dir="ltr"
              inputmode="numeric"
              maxlength="6"
              class="neo-input bg-white/95 text-center tracking-[0.35em]"
              autocomplete="one-time-code"
            />
          </AppFormField>
          <p
            v-if="debugCode"
            class="bg-brand-primary-soft px-3 py-2 text-center text-xs font-bold text-brand-primary"
            style="border-radius: var(--sz-canva-radius);"
          >
            {{ t('auth.debugOtpHint', { code: debugCode }) }}
            <span class="mt-1 block font-medium text-brand-navy/80">{{ t('auth.debugOtpDevOnly') }}</span>
          </p>
          <p v-if="error" class="venus-alert-error text-start">{{ error }}</p>
          <button type="submit" class="canva-gate-btn-primary" :disabled="pending">
            {{ pending ? t('common.loading') : t('auth.continueConfirm') }}
          </button>
          <button type="button" class="canva-gate-btn-secondary" :disabled="pending" @click="requestOtp">
            {{ t('auth.resendOtp') }}
          </button>
          <button type="button" class="canva-gate-btn-secondary" @click="goLoginPassword">
            {{ t('auth.loginWithPassword') }}
          </button>
        </form>
      </div>
    </div>
  </AppModal>
</template>
