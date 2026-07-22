<script setup lang="ts">
import type { AuthFlowRole } from '~/composables/useAuthFlow'

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { fetch: fetchAuth, login } = useAuth()
const {
  open,
  step,
  role,
  purpose,
  loginMode,
  returnTo,
  close,
} = useAuthFlow()

const name = ref('')
const phone = ref('')
const identifier = ref('')
const password = ref('')
const clubNameFa = ref('')
const code = ref('')
const pending = ref(false)
const error = ref('')
const debugCode = ref('')
const maskedPhone = ref('')
const smsMode = ref<'log' | 'live'>('log')

const { pilotNoCoach } = usePilotFlags()

const allRoles: Array<{ id: AuthFlowRole; title: string; body: string; icon: string }> = [
  { id: 'ATHLETE', title: 'register.roleAthlete', body: 'auth.roleAthleteHint', icon: 'sports_tennis' },
  { id: 'COACH', title: 'register.roleCoach', body: 'auth.roleCoachHint', icon: 'fitness_center' },
  { id: 'CLUB_ADMIN', title: 'register.roleOwner', body: 'auth.roleOwnerHint', icon: 'apartment' },
]

const roles = computed(() =>
  pilotNoCoach.value ? allRoles.filter((item) => item.id !== 'COACH') : allRoles,
)

const title = computed(() => {
  if (step.value === 'role') return t('auth.roleTitle')
  if (step.value === 'login' && loginMode.value === 'password') return t('auth.ownerPasswordTitle')
  if (step.value === 'login') return t('auth.loginToInbox')
  if (step.value === 'otp') return t('auth.otpTitle')
  if (role.value === 'COACH') return t('auth.registerCoachTitle')
  if (role.value === 'CLUB_ADMIN') return t('auth.registerOwnerTitle')
  return t('auth.registerAthleteTitle')
})

const otpHint = computed(() => {
  if (smsMode.value === 'live') return t('auth.otpSentHint', { phone: maskedPhone.value })
  return t('auth.otpLogModeHint', { phone: maskedPhone.value })
})

function resetForm() {
  name.value = ''
  phone.value = ''
  identifier.value = ''
  password.value = ''
  clubNameFa.value = ''
  code.value = ''
  error.value = ''
  debugCode.value = ''
  maskedPhone.value = ''
  smsMode.value = 'log'
  pending.value = false
}

function handleClose() {
  resetForm()
  close()
}

function goGate() {
  resetForm()
  goPhoneLogin()
}

function goRole() {
  purpose.value = 'register'
  step.value = 'role'
}

function selectRole(next: AuthFlowRole) {
  role.value = next
  purpose.value = 'register'
  step.value = 'register'
}

function goPasswordLogin() {
  purpose.value = 'login'
  loginMode.value = 'password'
  step.value = 'login'
  error.value = ''
}

function goPhoneLogin() {
  purpose.value = 'login'
  loginMode.value = 'phone'
  step.value = 'login'
  error.value = ''
}

async function submitPasswordLogin() {
  error.value = ''
  if (!identifier.value.trim() || !password.value) {
    error.value = t('auth.invalidCredentials')
    return
  }
  pending.value = true
  try {
    const resolvedReturnTo = returnTo.value || (typeof route.query.returnTo === 'string' ? route.query.returnTo : '')
    await login(identifier.value.trim(), password.value, resolvedReturnTo || undefined)
    handleClose()
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 403) error.value = t('auth.accountDisabled')
    else if (status === 429) error.value = t('errors.rateLimited')
    else error.value = t('auth.invalidCredentials')
  } finally {
    pending.value = false
  }
}

async function requestOtp() {
  error.value = ''
  pending.value = true
  try {
    const data = await $fetch<{ phone: string; debugCode?: string; smsMode?: 'log' | 'live' }>('/api/auth/otp/request', {
      method: 'POST',
      body: {
        phone: phone.value,
        purpose: purpose.value,
        role: purpose.value === 'register' ? role.value : undefined,
        name: purpose.value === 'register' ? name.value : undefined,
        clubNameFa: purpose.value === 'register' && role.value === 'CLUB_ADMIN' ? clubNameFa.value : undefined,
      },
    })
    maskedPhone.value = data.phone
    debugCode.value = data.debugCode || ''
    code.value = data.debugCode || ''
    smsMode.value = data.smsMode === 'live' ? 'live' : 'log'
    step.value = 'otp'
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 404) error.value = t('auth.phoneNotFound')
    else if (status === 409) error.value = t('auth.phoneTaken')
    else if (status === 400) error.value = t('auth.invalidPhone')
    else if (status === 429) error.value = t('errors.rateLimited')
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
        returnTo: returnTo.value || (typeof route.query.returnTo === 'string' ? route.query.returnTo : ''),
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
</script>

<template>
  <AppModal :open="open" max-width-class="max-w-sm" @close="handleClose">
    <div class="canva-auth-sheet">
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

      <div class="space-y-4 px-5 pb-6 pt-2">
        <h2 class="text-center text-lg font-bold text-brand-navy">{{ title }}</h2>

        <template v-if="step === 'login' && loginMode === 'password'">
          <p class="text-center text-sm text-brand-gray-600">{{ t('auth.ownerPasswordHint') }}</p>
          <AppFormField field-id="auth-identifier" :label="t('auth.emailOrPhone')">
            <input
              id="auth-identifier"
              v-model="identifier"
              dir="ltr"
              class="neo-input"
              autocomplete="username"
            />
          </AppFormField>
          <AppFormField field-id="auth-password" :label="t('auth.password')">
            <input
              id="auth-password"
              v-model="password"
              type="password"
              class="neo-input"
              autocomplete="current-password"
            />
          </AppFormField>
          <p v-if="error" class="venus-alert-error">{{ error }}</p>
          <button type="button" class="btn-primary w-full py-3" :disabled="pending" @click="submitPasswordLogin">
            {{ pending ? t('common.loading') : t('auth.login') }}
          </button>
          <NuxtLink
            :to="localePath('/forgot-password')"
            class="block text-center text-sm font-bold text-brand-navy underline"
            @click="handleClose"
          >
            {{ t('auth.forgotPassword') }}
          </NuxtLink>
          <div class="space-y-2 border-t border-brand-gray-200 pt-4">
            <button type="button" class="btn-secondary w-full py-3" @click="goPhoneLogin">
              {{ t('auth.loginWithPhone') }}
            </button>
            <button type="button" class="btn-ghost w-full" @click="goRole">
              {{ t('auth.register') }}
            </button>
          </div>
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
          <button type="button" class="btn-ghost w-full" @click="goGate">
            {{ t('common.back') }}
          </button>
        </template>

        <template v-else-if="step === 'register'">
          <AppFormField
            field-id="auth-name"
            :label="role === 'CLUB_ADMIN' ? t('auth.ownerContactName') : t('auth.fullName')"
          >
            <input id="auth-name" v-model="name" class="neo-input" autocomplete="name" />
          </AppFormField>
          <AppFormField
            v-if="role === 'CLUB_ADMIN'"
            field-id="auth-club"
            :label="t('register.clubNameFa')"
          >
            <input id="auth-club" v-model="clubNameFa" class="neo-input" />
          </AppFormField>
          <AppFormField field-id="auth-phone" :label="t('common.mobile')">
            <input
              id="auth-phone"
              v-model="phone"
              dir="ltr"
              inputmode="tel"
              class="neo-input"
              placeholder="09xxxxxxxxx"
              autocomplete="tel"
            />
          </AppFormField>
          <p v-if="error" class="venus-alert-error">{{ error }}</p>
          <button type="button" class="btn-primary w-full py-3" :disabled="pending" @click="requestOtp">
            {{ pending ? t('common.loading') : t('auth.continueConfirm') }}
          </button>
          <button type="button" class="btn-ghost w-full" @click="goRole()">
            {{ t('common.back') }}
          </button>
        </template>

        <template v-else-if="step === 'login'">
          <p class="text-center text-sm text-brand-gray-600">{{ t('auth.phoneLoginHint') }}</p>
          <AppFormField field-id="auth-phone-login" :label="t('common.mobile')">
            <input
              id="auth-phone-login"
              v-model="phone"
              dir="ltr"
              inputmode="tel"
              class="neo-input"
              placeholder="09xxxxxxxxx"
              autocomplete="tel"
            />
          </AppFormField>
          <p v-if="error" class="venus-alert-error">{{ error }}</p>
          <button type="button" class="btn-primary w-full py-3" :disabled="pending" @click="requestOtp">
            {{ pending ? t('common.loading') : t('auth.continueConfirm') }}
          </button>
          <button type="button" class="btn-ghost w-full text-xs" @click="goPasswordLogin">
            {{ t('auth.ownerPasswordFallback') }}
          </button>
          <button type="button" class="btn-ghost w-full" @click="goRole">
            {{ t('auth.register') }}
          </button>
        </template>

        <template v-else-if="step === 'otp'">
          <p class="text-center text-sm text-brand-gray-600">
            {{ otpHint }}
          </p>
          <AppFormField field-id="auth-otp" :label="t('auth.otpCode')">
            <input
              id="auth-otp"
              v-model="code"
              dir="ltr"
              inputmode="numeric"
              maxlength="6"
              class="neo-input text-center tracking-[0.35em]"
              autocomplete="one-time-code"
            />
          </AppFormField>
          <p v-if="debugCode" class="rounded-lg bg-brand-primary-soft px-3 py-2 text-center text-xs font-bold text-brand-primary">
            {{ t('auth.debugOtpHint', { code: debugCode }) }}
          </p>
          <p v-if="error" class="venus-alert-error">{{ error }}</p>
          <button type="button" class="btn-primary w-full py-3" :disabled="pending" @click="verifyOtp">
            {{ pending ? t('common.loading') : t('auth.continueConfirm') }}
          </button>
          <button type="button" class="btn-ghost w-full" :disabled="pending" @click="requestOtp">
            {{ t('auth.resendOtp') }}
          </button>
        </template>
      </div>
    </div>
  </AppModal>
</template>
