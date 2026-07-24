<script setup lang="ts">
import type { AuthFlowRole } from '~/composables/useAuthFlow'

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { fetch: fetchAuth } = useAuth()
const {
  open,
  step,
  role,
  purpose,
  returnTo,
  notice,
  close,
} = useAuthFlow()

const name = ref('')
const phone = ref('')
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
  if (step.value === 'gate') return t('auth.gateTitle')
  if (step.value === 'role') return t('auth.roleTitle')
  if (step.value === 'login') return t('auth.loginToInbox')
  if (step.value === 'otp') return t('auth.otpTitle')
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
  purpose.value = 'login'
  step.value = 'gate'
}

function goLogin() {
  resetForm()
  purpose.value = 'login'
  step.value = 'login'
}

function goRole() {
  resetForm()
  purpose.value = 'register'
  step.value = 'role'
}

function selectRole(next: AuthFlowRole) {
  role.value = next
  purpose.value = 'register'
  step.value = 'register'
}

async function requestOtp() {
  error.value = ''
  pending.value = true
  try {
    const data = await $fetch<{
      phone: string
      debugCode?: string
      smsMode?: 'log' | 'live' | 'bypass'
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
        returnTo: returnTo.value || (typeof route.query.returnTo === 'string' ? route.query.returnTo : ''),
      },
    })

    if (data.bypass) {
      await fetchAuth()
      handleClose()
      await navigateTo(data.redirectTo || localePath('/'))
      return
    }

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
        <p v-if="notice" class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-bold text-amber-900">
          {{ notice }}
        </p>

        <template v-if="step === 'gate'">
          <p class="text-center text-sm text-brand-gray-600">{{ t('home.roleTileGuest') }}</p>
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
          <button type="button" class="btn-ghost w-full" @click="goGate">
            {{ t('common.back') }}
          </button>
        </template>

        <form v-else-if="step === 'register'" class="space-y-4" @submit.prevent="requestOtp">
          <AppFormField
            field-id="auth-name"
            :label="role === 'CLUB_ADMIN' ? t('auth.ownerContactName') : t('auth.fullName')"
          >
            <input id="auth-name" v-model="name" class="neo-input bg-white/95" autocomplete="name" />
          </AppFormField>
          <AppFormField
            v-if="role === 'CLUB_ADMIN'"
            field-id="auth-club"
            :label="t('register.clubNameFa')"
          >
            <input id="auth-club" v-model="clubNameFa" class="neo-input bg-white/95" />
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
          <p v-if="error" class="venus-alert-error">{{ error }}</p>
          <button type="submit" class="btn-primary w-full py-3" :disabled="pending">
            {{ pending ? t('common.loading') : t('auth.continueConfirm') }}
          </button>
          <button type="button" class="btn-ghost w-full" @click="goRole()">
            {{ t('common.back') }}
          </button>
        </form>

        <form v-else-if="step === 'login'" class="space-y-4" @submit.prevent="requestOtp">
          <p class="text-center text-sm text-brand-gray-600">{{ t('auth.phoneLoginHint') }}</p>
          <AppFormField field-id="login-phone" :label="t('common.mobile')">
            <input
              id="login-phone"
              v-model="phone"
              dir="ltr"
              inputmode="tel"
              class="neo-input bg-white/95"
              placeholder="09xxxxxxxxx"
              autocomplete="tel"
            />
          </AppFormField>
          <p v-if="error" class="venus-alert-error">{{ error }}</p>
          <button type="submit" class="btn-primary w-full py-3" :disabled="pending">
            {{ pending ? t('common.loading') : t('auth.continueConfirm') }}
          </button>
          <button type="button" class="btn-ghost w-full" @click="goRole">
            {{ t('auth.register') }}
          </button>
          <button type="button" class="btn-ghost w-full" @click="goGate">
            {{ t('common.back') }}
          </button>
        </form>

        <form v-else-if="step === 'otp'" class="space-y-4" @submit.prevent="verifyOtp">
          <p class="text-center text-sm text-brand-gray-600">
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
          <p v-if="debugCode" class="rounded-lg bg-brand-primary-soft px-3 py-2 text-center text-xs font-bold text-brand-primary">
            {{ t('auth.debugOtpHint', { code: debugCode }) }}
          </p>
          <p v-if="error" class="venus-alert-error">{{ error }}</p>
          <button type="submit" class="btn-primary w-full py-3" :disabled="pending">
            {{ pending ? t('common.loading') : t('auth.continueConfirm') }}
          </button>
          <button type="button" class="btn-ghost w-full" :disabled="pending" @click="requestOtp">
            {{ t('auth.resendOtp') }}
          </button>
        </form>
      </div>
    </div>
  </AppModal>
</template>
