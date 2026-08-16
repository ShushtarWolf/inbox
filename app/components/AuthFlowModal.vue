<script setup lang="ts">
import type { AuthFlowRole, AuthWelcomeVariant } from '~/composables/useAuthFlow'
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
  welcomeVariant,
  pendingRedirect,
  close,
} = useAuthFlow()

const name = ref('')
const phone = ref('')
const email = ref('')
const identifier = ref('')
const password = ref('')
const clubNameFa = ref('')
const addressFa = ref('')
const sport = ref<'padel' | 'tennis' | 'both'>('padel')
const courtCount = ref<1 | 2 | 3>(1)
const credentialUrls = ref<string[]>([])
const licenseName = ref('')
const code = ref('')
const pending = ref(false)
const error = ref('')
const debugCode = ref('')
const maskedPhone = ref('')
const selectedRole = ref<AuthFlowRole>('ATHLETE')

const { smsMode, smsPhase, smsLive } = useSmsCapability()
const {
  uploading: licenseUploading,
  error: licenseUploadError,
  showRules: licenseShowRules,
  showFailure: licenseShowFailure,
  accept: licenseAccept,
  askPick: licenseAskPick,
  closeRules: licenseCloseRules,
  confirmRules: licenseConfirmRules,
  dismissFailure: licenseDismissFailure,
  upload: uploadLicense,
} = useImageUpload({ guest: true })
const licenseInputOtpRef = ref<HTMLInputElement | null>(null)
const licenseInputPasswordRef = ref<HTMLInputElement | null>(null)
const licensePickerChannel = ref<'otp' | 'password'>('otp')
const { pilotNoCoach } = usePilotFlags()

/** Canva role picker (4.png): Athlete / Coach / Owner — Coach hidden when PILOT_NO_COACH. */
const allRoles: Array<{ id: AuthFlowRole; title: string; body: string }> = [
  { id: 'ATHLETE', title: 'register.roleAthlete', body: 'auth.roleAthleteHint' },
  { id: 'COACH', title: 'register.roleCoach', body: 'auth.roleCoachHint' },
  { id: 'CLUB_ADMIN', title: 'register.roleOwner', body: 'auth.roleOwnerHint' },
]
const roles = computed(() =>
  pilotNoCoach.value ? allRoles.filter((item) => item.id !== 'COACH') : allRoles,
)

const sportOptions = [
  { value: 'tennis' as const, labelKey: 'auth.sportTennis' },
  { value: 'padel' as const, labelKey: 'auth.sportPadel' },
  { value: 'both' as const, labelKey: 'auth.sportBoth' },
]

const courtCountOptions = [
  { value: 1 as const, labelKey: 'auth.courtCount1' },
  { value: 2 as const, labelKey: 'auth.courtCount2' },
  { value: 3 as const, labelKey: 'auth.courtCount3Plus' },
]

const title = computed(() => {
  if (step.value === 'gate' || step.value === 'welcome') return ''
  if (step.value === 'role') return t('auth.register')
  if (step.value === 'login') {
    return channel.value === 'otp' ? t('auth.loginWithPhone') : t('auth.loginToInbox')
  }
  if (step.value === 'otp') {
    return purpose.value === 'register' && role.value === 'CLUB_ADMIN'
      ? t('auth.registerOwnerTitle')
      : purpose.value === 'register' && role.value === 'COACH'
        ? t('auth.registerCoachTitle')
        : purpose.value === 'register'
          ? t('auth.registerAthleteTitle')
          : t('auth.otpTitle')
  }
  if (role.value === 'CLUB_ADMIN') return t('auth.registerOwnerTitle')
  if (role.value === 'COACH') return t('auth.registerCoachTitle')
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
  addressFa.value = ''
  sport.value = 'padel'
  courtCount.value = 1
  credentialUrls.value = []
  licenseName.value = ''
  code.value = ''
  error.value = ''
  debugCode.value = ''
  maskedPhone.value = ''
  pending.value = false
  selectedRole.value = 'ATHLETE'
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
  // Phone OTP is MVP primary (log mode = honest debugCode; live MULTI = real SMS).
  channel.value = 'otp'
  step.value = 'gate'
}

function goLogin() {
  resetForm()
  purpose.value = 'login'
  channel.value = 'otp'
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
  channel.value = 'otp'
  selectedRole.value = 'ATHLETE'
  step.value = 'role'
}

function continueRole() {
  const next = selectedRole.value === 'COACH' && pilotNoCoach.value ? 'ATHLETE' : selectedRole.value
  selectedRole.value = next
  role.value = next
  purpose.value = 'register'
  channel.value = 'otp'
  step.value = 'register'
}

function goBack() {
  if (step.value === 'otp') {
    step.value = purpose.value === 'register' ? 'register' : 'login'
    channel.value = 'otp'
    error.value = ''
    return
  }
  if (step.value === 'register') {
    goRole()
    return
  }
  if (step.value === 'login') {
    goGate()
    return
  }
  goGate()
}

function goRegisterOtp() {
  error.value = ''
  channel.value = 'otp'
}

function goRegisterPassword() {
  error.value = ''
  channel.value = 'password'
}

function openLicensePicker(which: 'otp' | 'password') {
  if (licenseUploading.value) return
  licensePickerChannel.value = which
  licenseAskPick()
}

function confirmLicenseRules() {
  licenseConfirmRules(() => {
    const el = licensePickerChannel.value === 'password'
      ? licenseInputPasswordRef.value
      : licenseInputOtpRef.value
    el?.click()
  })
}

async function onLicenseFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  error.value = ''
  const result = await uploadLicense(file)
  if (!result?.url) {
    error.value = licenseUploadError.value || t('upload.failed')
    return
  }
  credentialUrls.value = [result.url]
  licenseName.value = file.name
}

async function showWelcome(variant: AuthWelcomeVariant, redirectTo: string) {
  welcomeVariant.value = variant
  pendingRedirect.value = redirectTo
  // Court confirm handoff: skip home welcome thrash so slots reopen in confirm sheet.
  const dest = redirectTo.startsWith('/') ? redirectTo : localePath(redirectTo)
  const isClubConfirmReturn = /\/clubs\/[^/?]+/.test(dest)
    && (dest.includes('slots=') || dest.includes('slot=') || dest.includes('time='))
  if (isClubConfirmReturn) {
    handleClose()
    await navigateTo(dest)
    return
  }
  // Sheet over home (Canva 7 / 11 / 15) — never an orphan success page.
  await navigateTo(localePath('/'))
  step.value = 'welcome'
}

async function dismissWelcome() {
  const dest = pendingRedirect.value
  handleClose()
  if (dest && dest !== localePath('/') && dest !== '/') {
    await navigateTo(dest.startsWith('/') ? dest : localePath(dest))
  }
}

function welcomeVariantForAuth(kind: 'login' | 'register', authRole?: string): AuthWelcomeVariant {
  if (kind === 'login') return 'login'
  if (authRole === 'CLUB_ADMIN') return 'owner'
  return 'athlete'
}

/** Prefer role dashboard when API omits redirectTo (OTP / password happy path). */
function fallbackAuthRedirect(authRole?: string) {
  if (authRole === 'CLUB_ADMIN') return localePath('/owner')
  if (authRole === 'COACH' && !pilotNoCoach.value) return localePath('/coach')
  return localePath('/athlete')
}

async function loginWithPassword() {
  error.value = ''
  pending.value = true
  try {
    const data = await $fetch<{ redirectTo?: string; role?: string }>('/api/auth/login', {
      method: 'POST',
      body: {
        email: identifier.value,
        password: password.value,
        returnTo: safeReturnTo.value,
      },
    })
    await fetchAuth()
    await showWelcome(welcomeVariantForAuth('login', data.role), data.redirectTo || fallbackAuthRedirect(data.role))
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
  if (role.value === 'CLUB_ADMIN') {
    if (!clubNameFa.value.trim() || !phone.value.trim() || password.value.length < 6) {
      error.value = t('auth.registerOwnerRequired')
      return
    }
  } else if (!name.value.trim() || password.value.length < 6 || (!phone.value.trim() && !email.value.trim())) {
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
          name: name.value.trim() || clubNameFa.value.trim(),
          phone: phone.value || undefined,
          email: email.value || undefined,
          password: password.value,
          clubNameFa: clubNameFa.value,
          addressFa: addressFa.value.trim() || undefined,
          city: 'تهران',
          sport: sport.value,
          courtCount: courtCount.value,
          credentialUrls: credentialUrls.value.length ? credentialUrls.value : undefined,
          returnTo: returnPath,
        },
      })
      await fetchAuth()
      await showWelcome('owner', data.redirectTo || localePath('/owner/pending'))
      return
    }

    if (role.value === 'COACH') {
      const coachEmail = email.value.trim() || (phone.value.trim() ? `${phone.value.trim().replace(/\D/g, '')}@coach.inbox.local` : '')
      if (!coachEmail) {
        error.value = t('auth.registerIdentityRequired')
        pending.value = false
        return
      }
      const data = await $fetch<{ redirectTo?: string }>('/api/auth/register-coach', {
        method: 'POST',
        body: {
          name: name.value.trim(),
          email: coachEmail,
          phone: phone.value || undefined,
          password: password.value,
          returnTo: returnPath,
        },
      })
      await fetchAuth()
      await showWelcome('athlete', data.redirectTo || localePath('/coach'))
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
    await showWelcome('athlete', data.redirectTo || fallbackAuthRedirect('ATHLETE'))
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    const message = String((err as { statusMessage?: string; data?: { statusMessage?: string } })?.statusMessage
      || (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      || '')
    if (status === 404 && /coach product/i.test(message)) error.value = t('auth.coachDisabledInPilot')
    else if (status === 409 && /phone/i.test(message)) error.value = t('auth.phoneTaken')
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
  if (purpose.value === 'register' && role.value === 'CLUB_ADMIN') {
    if (!clubNameFa.value.trim() || !phone.value.trim()) {
      error.value = t('auth.registerOwnerRequired')
      return
    }
  }
  pending.value = true
  try {
    const data = await $fetch<{
      phone: string
      debugCode?: string
      smsMode?: 'log' | 'live'
      smsPhase?: 'SINGLE' | 'MULTI'
    }>('/api/auth/otp/request', {
      method: 'POST',
      body: {
        phone: phone.value,
        purpose: purpose.value,
        role: purpose.value === 'register' ? role.value : undefined,
        name: purpose.value === 'register'
          ? (role.value === 'CLUB_ADMIN' ? (name.value.trim() || clubNameFa.value.trim()) : name.value)
          : undefined,
        clubNameFa: purpose.value === 'register' && role.value === 'CLUB_ADMIN' ? clubNameFa.value : undefined,
        addressFa: purpose.value === 'register' && role.value === 'CLUB_ADMIN' ? addressFa.value.trim() || undefined : undefined,
        sport: purpose.value === 'register' && role.value === 'CLUB_ADMIN' ? sport.value : undefined,
        courtCount: purpose.value === 'register' && role.value === 'CLUB_ADMIN' ? courtCount.value : undefined,
        credentialUrls: purpose.value === 'register' && role.value === 'CLUB_ADMIN' && credentialUrls.value.length
          ? credentialUrls.value
          : undefined,
        returnTo: safeReturnTo.value,
      },
    })

    maskedPhone.value = data.phone
    debugCode.value = data.debugCode || ''
    // Prefill only in log/dry-run so local testing works; never imply a real SMS was sent.
    code.value = data.smsMode === 'log' ? (data.debugCode || '') : ''
    step.value = 'otp'
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 404 && /coach product/i.test(String((err as { statusMessage?: string })?.statusMessage || ''))) {
      error.value = t('auth.coachDisabledInPilot')
    }
    else if (status === 404) error.value = t('auth.phoneNotFound')
    else if (status === 409) error.value = t('auth.phoneTaken')
    else if (status === 400) error.value = t('auth.invalidPhone')
    else if (status === 429) error.value = t('errors.rateLimited')
    else if (status === 503 || status === 500) error.value = t('auth.otpServerUnavailable')
    else if (status === 502) {
      const msg = String((err as { statusMessage?: string; data?: { statusMessage?: string } })?.statusMessage
        || (err as { data?: { statusMessage?: string } })?.data?.statusMessage
        || '')
      error.value = /account-owner phone|صاحب حساب|technical|operational/i.test(msg)
        ? t('auth.otpTemplateNotOperational')
        : t('auth.otpSendFailed')
    }
    else error.value = t('auth.otpSendFailed')
  } finally {
    pending.value = false
  }
}

async function verifyOtp() {
  error.value = ''
  pending.value = true
  try {
    const data = await $fetch<{ redirectTo?: string; role?: string }>('/api/auth/otp/verify', {
      method: 'POST',
      body: {
        phone: maskedPhone.value || phone.value,
        code: code.value,
        purpose: purpose.value,
        returnTo: safeReturnTo.value,
      },
    })
    await fetchAuth()
    await showWelcome(
      welcomeVariantForAuth(purpose.value, data.role || role.value),
      data.redirectTo || fallbackAuthRedirect(data.role || role.value),
    )
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

/** Auto-flip to OTP when SMS becomes MULTI-live while auth sheet is open. */
watch(smsLive, (live) => {
  if (!open.value || !live) return
  if (step.value === 'login' || step.value === 'register' || step.value === 'gate' || step.value === 'role') {
    channel.value = 'otp'
  }
})

watch(step, (next) => {
  if (next === 'role') selectedRole.value = role.value
})

// Dismiss leftover session notice when user navigates to a public page (e.g. club detail)
watch(
  () => route.fullPath,
  (next, prev) => {
    if (!open.value || !notice.value || next === prev) return
    if (step.value === 'welcome') return
    const path = next.split('?')[0] || next
    if (path.endsWith('/login')) return
    if (!isAuthProtectedPath(path)) handleClose()
  },
)
</script>

<template>
  <AppModal :open="open" patterned max-width-class="max-w-sm" overlay-class="z-[70]" @close="step === 'welcome' ? dismissWelcome() : handleClose()">
    <div class="relative z-[1]">
      <div v-if="step !== 'welcome'" class="canva-auth-accent" />
      <div class="relative z-[1] flex items-center justify-center px-4 py-3">
        <button
          v-if="step === 'gate' || step === 'welcome'"
          type="button"
          class="absolute left-4 inline-flex items-center gap-1 text-xs font-bold text-brand-gray-600"
          @click="step === 'welcome' ? dismissWelcome() : handleClose()"
        >
          <AppIcon name="close" size="sm" />
          {{ t('common.close') }}
        </button>
        <button
          v-else
          type="button"
          class="absolute left-4 inline-flex items-center gap-1 text-xs font-bold text-brand-gray-600"
          @click="goBack"
        >
          <AppIcon name="arrow_back" size="sm" />
          {{ t('common.back') }}
        </button>
        <div v-if="step === 'gate' || step === 'welcome'" class="flex flex-col items-center">
          <NuxtLink
            :to="localePath('/')"
            class="flex items-center gap-2"
            :aria-label="t('brand.name')"
            @click="handleClose()"
          >
            <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7" />
            <InboxWordmark class="text-base text-brand-navy" />
          </NuxtLink>
          <p class="mt-0.5 text-[11px] font-bold text-brand-primary">Check this box!</p>
        </div>
        <span v-else class="h-7" />
      </div>

      <div class="canva-auth-body">
        <h2 v-if="title" class="text-center text-lg font-bold text-brand-primary">{{ title }}</h2>
        <p
          v-if="notice && step !== 'welcome'"
          class="border border-amber-200 bg-amber-50 px-3 py-2 text-start text-xs font-bold text-amber-900"
          style="border-radius: var(--sz-canva-radius);"
        >
          {{ notice }}
        </p>

        <!-- Welcome / success (Canva 7, 11, 15) -->
        <div v-if="step === 'welcome'" class="canva-auth-welcome">
          <AppIcon name="check_circle" size="lg" class="mx-auto text-emerald-600" />
          <p class="canva-auth-welcome-title">{{ t('auth.welcomeWhistle') }}</p>
          <p class="canva-auth-welcome-title">{{ t('auth.welcomeInbox') }}</p>
          <p v-if="welcomeVariant === 'owner'" class="mt-3 text-center text-xs text-brand-gray-600">
            {{ t('auth.welcomeOwnerReview') }}
          </p>
          <button type="button" class="canva-gate-btn-primary mt-5" @click="dismissWelcome">
            {{ t('auth.welcomeCta') }}
          </button>
        </div>

        <template v-else-if="step === 'gate'">
          <!-- Intentional: SMS/password only — no Google (product exclusion). -->
          <button type="button" class="canva-gate-btn-primary" @click="goRole">
            {{ t('auth.register') }}
          </button>
          <button type="button" class="canva-gate-btn-secondary" @click="goLogin">
            {{ t('auth.login') }}
          </button>
          <p
            v-if="!smsLive"
            class="border border-amber-200 bg-amber-50 px-3 py-2 text-start text-xs font-bold text-amber-900"
            style="border-radius: var(--sz-canva-radius);"
          >
            {{ t('auth.otpLogModeBanner') }}
          </p>
        </template>

        <template v-else-if="step === 'role'">
          <p class="text-center text-sm text-brand-gray-600">{{ t('auth.roleTitle') }}</p>
          <button
            v-for="item in roles"
            :key="item.id"
            type="button"
            class="canva-role-card"
            :class="selectedRole === item.id ? 'canva-role-card-active' : ''"
            @click="selectedRole = item.id"
          >
            <span
              class="canva-role-check"
              :class="selectedRole === item.id ? 'canva-role-check-on' : ''"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1 text-start">
              <p class="font-bold text-brand-navy">{{ t(item.title) }}</p>
              <p class="mt-0.5 text-xs text-brand-gray-600">{{ t(item.body) }}</p>
            </div>
          </button>
          <button type="button" class="canva-gate-btn-primary" @click="continueRole">
            {{ t('auth.continue') }}
          </button>
        </template>

        <!-- Phone OTP register (Canva primary) — password is desk fallback only -->
        <form
          v-else-if="step === 'register' && channel === 'otp'"
          class="space-y-4"
          @submit.prevent="requestOtp"
        >
          <p
            class="border border-amber-200 bg-amber-50 px-3 py-2 text-start text-xs font-bold text-amber-900"
            style="border-radius: var(--sz-canva-radius);"
          >
            {{ smsLive ? t('auth.phoneLoginHintMulti') : t('auth.otpLogModeBanner') }}
          </p>
          <template v-if="role === 'CLUB_ADMIN'">
            <AppFormField field-id="auth-otp-club" :label="t('auth.clubName')">
              <input id="auth-otp-club" v-model="clubNameFa" class="neo-input bg-white/95" required />
            </AppFormField>
            <AppFormField field-id="auth-otp-phone" :label="t('auth.ownerPhone')">
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
            <AppFormField field-id="auth-otp-address" :label="t('auth.addressRegion')">
              <input id="auth-otp-address" v-model="addressFa" class="neo-input bg-white/95" />
            </AppFormField>
            <div class="grid grid-cols-2 gap-2">
              <AppFormField field-id="auth-otp-courts" :label="t('auth.courtCount')">
                <select id="auth-otp-courts" v-model.number="courtCount" class="neo-select bg-white/95">
                  <option v-for="opt in courtCountOptions" :key="opt.value" :value="opt.value">
                    {{ t(opt.labelKey) }}
                  </option>
                </select>
              </AppFormField>
              <AppFormField field-id="auth-otp-sport" :label="t('auth.sport')">
                <select id="auth-otp-sport" v-model="sport" class="neo-select bg-white/95">
                  <option v-for="opt in sportOptions" :key="opt.value" :value="opt.value">
                    {{ t(opt.labelKey) }}
                  </option>
                </select>
              </AppFormField>
            </div>
            <div class="canva-auth-upload">
              <div class="min-w-0 flex-1 text-start">
                <p class="text-xs font-bold text-brand-navy">{{ t('auth.licenseUpload') }}</p>
                <p class="mt-0.5 text-[10px] text-brand-gray-500">{{ t('auth.licenseHint') }}</p>
                <p v-if="licenseName" class="mt-1 truncate text-[10px] text-brand-primary">{{ licenseName }}</p>
              </div>
              <button
                type="button"
                class="canva-auth-upload-btn"
                :disabled="licenseUploading"
                @click="openLicensePicker('otp')"
              >
                {{ licenseUploading ? t('common.loading') : t('auth.selectFile') }}
              </button>
              <input
                ref="licenseInputOtpRef"
                type="file"
                class="sr-only"
                :accept="licenseAccept"
                :disabled="licenseUploading"
                @change="onLicenseFile"
              >
            </div>
          </template>
          <template v-else>
            <AppFormField field-id="auth-otp-name" :label="t('auth.fullName')">
              <input id="auth-otp-name" v-model="name" class="neo-input bg-white/95" autocomplete="name" required />
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
          </template>
          <p v-if="error" class="venus-alert-error text-start">{{ error }}</p>
          <button type="submit" class="canva-gate-btn-primary" :disabled="pending || licenseUploading">
            {{ pending ? t('common.loading') : t('auth.continueConfirm') }}
          </button>
          <button type="button" class="hidden w-full text-center text-xs font-bold text-brand-gray-600 underline min-[431px]:block" @click="goRegisterPassword">
            {{ t('auth.registerWithPassword') }}
          </button>
        </form>

        <!-- Password register (desk fallback — not visual primary) -->
        <form
          v-else-if="step === 'register' && channel === 'password'"
          class="space-y-4"
          @submit.prevent="registerWithPassword"
        >
          <p
            class="border border-brand-gray-200 bg-white/80 px-3 py-2 text-start text-xs text-brand-gray-600"
            style="border-radius: var(--sz-canva-radius);"
          >
            {{ t('auth.registerPasswordHint') }}
          </p>

          <template v-if="role === 'CLUB_ADMIN'">
            <AppFormField field-id="auth-club" :label="t('auth.clubName')">
              <input
                id="auth-club"
                v-model="clubNameFa"
                class="neo-input bg-white/95"
                :placeholder="t('auth.clubName')"
                required
              />
            </AppFormField>
            <AppFormField field-id="auth-phone" :label="t('auth.ownerPhone')">
              <input
                id="auth-phone"
                v-model="phone"
                dir="ltr"
                inputmode="tel"
                class="neo-input bg-white/95"
                :placeholder="t('auth.ownerPhone')"
                autocomplete="tel"
                required
              />
            </AppFormField>
            <AppFormField field-id="auth-address" :label="t('auth.addressRegion')">
              <input
                id="auth-address"
                v-model="addressFa"
                class="neo-input bg-white/95"
                :placeholder="t('auth.addressRegion')"
              />
            </AppFormField>
            <div class="grid grid-cols-2 gap-2">
              <AppFormField field-id="auth-court-count" :label="t('auth.courtCount')">
                <select id="auth-court-count" v-model.number="courtCount" class="neo-select bg-white/95">
                  <option v-for="opt in courtCountOptions" :key="opt.value" :value="opt.value">
                    {{ t(opt.labelKey) }}
                  </option>
                </select>
              </AppFormField>
              <AppFormField field-id="auth-sport" :label="t('auth.sport')">
                <select id="auth-sport" v-model="sport" class="neo-select bg-white/95">
                  <option v-for="opt in sportOptions" :key="opt.value" :value="opt.value">
                    {{ t(opt.labelKey) }}
                  </option>
                </select>
              </AppFormField>
            </div>
            <div class="canva-auth-upload">
              <div class="min-w-0 flex-1 text-start">
                <p class="text-xs font-bold text-brand-navy">{{ t('auth.licenseUpload') }}</p>
                <p class="mt-0.5 text-[10px] text-brand-gray-500">{{ t('auth.licenseHint') }}</p>
                <p v-if="licenseName" class="mt-1 truncate text-[10px] text-brand-primary">{{ licenseName }}</p>
              </div>
              <button
                type="button"
                class="canva-auth-upload-btn"
                :disabled="licenseUploading"
                @click="openLicensePicker('password')"
              >
                {{ licenseUploading ? t('common.loading') : t('auth.selectFile') }}
              </button>
              <input
                ref="licenseInputPasswordRef"
                type="file"
                class="sr-only"
                :accept="licenseAccept"
                :disabled="licenseUploading"
                @change="onLicenseFile"
              >
            </div>
            <p v-if="sport === 'both' && courtCount < 2" class="text-start text-[10px] text-brand-gray-500">
              {{ t('auth.sportBothHandoff') }}
            </p>
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
          </template>

          <template v-else>
            <AppFormField field-id="auth-name" :label="t('auth.fullName')">
              <SmoothCaretInput
                id="auth-name"
                v-model="name"
                :placeholder="t('auth.fullName')"
                autocomplete="name"
                required
              />
            </AppFormField>
            <AppFormField field-id="auth-phone" :label="t('common.mobile')">
              <input
                id="auth-phone"
                v-model="phone"
                dir="ltr"
                inputmode="tel"
                class="neo-input bg-white/95"
                :placeholder="t('common.mobile')"
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
              <SmoothCaretInput
                id="auth-password"
                v-model="password"
                type="password"
                autocomplete="new-password"
                required
                minlength="6"
              />
            </AppFormField>
          </template>

          <p v-if="error" class="venus-alert-error text-start">{{ error }}</p>
          <button type="submit" class="canva-gate-btn-primary" :disabled="pending || licenseUploading">
            {{ pending ? t('common.loading') : t('auth.continueConfirm') }}
          </button>
          <button
            type="button"
            class="block w-full text-center text-xs font-bold text-brand-primary underline"
            @click="goRegisterOtp"
          >
            {{ t('auth.registerWithPhone') }}
          </button>
        </form>

        <!-- Password login -->
        <form
          v-else-if="step === 'login' && channel === 'password'"
          class="space-y-4"
          @submit.prevent="loginWithPassword"
        >
          <p
            v-if="!smsLive"
            class="border border-amber-200 bg-amber-50 px-3 py-2 text-start text-xs font-bold text-amber-900"
            style="border-radius: var(--sz-canva-radius);"
          >
            {{ t('auth.otpLogModeBanner') }}
          </p>
          <p v-else class="text-center text-sm text-brand-gray-600">{{ t('auth.emailOrPhonePasswordHint') }}</p>
          <AppFormField field-id="login-identifier" :label="t('auth.emailOrPhone')">
            <SmoothCaretInput
              id="login-identifier"
              v-model="identifier"
              dir="ltr"
              autocomplete="username"
              required
            />
          </AppFormField>
          <AppFormField field-id="login-password" :label="t('auth.password')">
            <SmoothCaretInput
              id="login-password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              required
            />
          </AppFormField>
          <p v-if="error" class="venus-alert-error text-start">{{ error }}</p>
          <button type="submit" class="canva-gate-btn-primary" :disabled="pending">
            {{ pending ? t('common.loading') : t('auth.continueConfirm') }}
          </button>
          <button
            type="button"
            class="block w-full text-center text-xs font-bold text-brand-primary underline"
            @click="goForgotPassword"
          >
            {{ t('auth.forgotPassword') }}
          </button>
          <button
            type="button"
            class="canva-gate-btn-secondary"
            @click="goLoginOtp"
          >
            {{ t('auth.loginWithPhone') }}
          </button>
          <button type="button" class="canva-gate-btn-secondary" @click="goRole">
            {{ t('auth.register') }}
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
            {{ smsLive ? t('auth.phoneLoginHintMulti') : t('auth.otpLogModeBanner') }}
          </p>
          <AppFormField field-id="login-phone" :label="t('common.mobile')">
            <input
              id="login-phone"
              v-model="phone"
              dir="ltr"
              inputmode="tel"
              class="neo-input bg-white/95"
              :placeholder="t('auth.phonePlaceholder')"
              autocomplete="tel"
              required
            />
          </AppFormField>
          <p v-if="error" class="venus-alert-error text-start">{{ error }}</p>
          <button type="submit" class="canva-gate-btn-primary" :disabled="pending">
            {{ pending ? t('common.loading') : t('auth.continueConfirm') }}
          </button>
          <button type="button" class="hidden w-full text-center text-xs font-bold text-brand-gray-600 underline min-[431px]:block" @click="goLoginPassword">
            {{ t('auth.loginWithPassword') }}
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
              :placeholder="t('auth.otpCode')"
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
          <button type="button" class="hidden w-full text-center text-xs font-bold text-brand-gray-600 underline min-[431px]:block" @click="goLoginPassword">
            {{ t('auth.loginWithPassword') }}
          </button>
        </form>
      </div>
    </div>
  </AppModal>
  <AppUploadSheets
    :rules-open="licenseShowRules"
    :failure-open="licenseShowFailure"
    :failure-message="licenseUploadError"
    overlay-class="z-[80]"
    @confirm-rules="confirmLicenseRules"
    @close-rules="licenseCloseRules"
    @close-failure="licenseDismissFailure"
  />
</template>
