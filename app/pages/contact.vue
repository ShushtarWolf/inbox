<script setup lang="ts">
definePageMeta({ layout: 'default' })

const { t } = useI18n()
const localePath = useLocalePath()
const config = useRuntimeConfig()
const { smsPhase, smsLive } = useSmsCapability()
const { fetchErrorMessage } = useFetchError()
const { user } = useAuth()

const ownerName = computed(() => String(config.public.contactOwnerName || '').trim())
const address = computed(() => String(config.public.contactAddress || '').trim())
const postalCode = computed(() => String(config.public.contactPostalCode || '').trim())
const landline = computed(() => String(config.public.contactLandline || '').trim())
const mobile = computed(() => String(config.public.contactMobile || '').trim())
const email = computed(() => String(config.public.contactEmail || '').trim())

const CONTACT_EMAILS = [
  { address: 'info@inboxs.ir', labelKey: 'contact.emailInfo' },
  { address: 'support@inboxs.ir', labelKey: 'contact.emailSupport' },
  { address: 'privacy@inboxs.ir', labelKey: 'contact.emailPrivacy' },
  { address: 'complaints@inboxs.ir', labelKey: 'contact.emailComplaints' },
] as const

const contactEmails = computed(() => {
  const configured = email.value
  const rows = CONTACT_EMAILS.map((row) => ({ address: row.address, labelKey: row.labelKey }))
  if (configured && !rows.some((row) => row.address.toLowerCase() === configured.toLowerCase())) {
    rows.unshift({ address: configured, labelKey: 'contact.emailInfo' })
  }
  return rows
})

const enamadReady = computed(() =>
  Boolean(String(config.public.enamadId || '').trim() && String(config.public.enamadCode || '').trim()),
)

const paymentsMode = computed(() => String(config.public.paymentsMode || 'pay_at_club').trim())
const ipgLive = computed(() => paymentsMode.value === 'live')
const ipgTest = computed(() => paymentsMode.value === 'test')

const messageName = ref('')
const messageEmail = ref('')
const messageBody = ref('')
const messageError = ref('')
const messageSuccess = ref('')
const sending = ref(false)

function ipgReadinessCopy() {
  if (ipgLive.value) return t('contact.ipgReadyLive')
  if (ipgTest.value) return t('contact.ipgReadyTest')
  return t('contact.ipgReadyPayAtClub')
}

const mobileTel = computed(() => {
  if (!mobile.value) return ''
  const digits = mobile.value.replace(/\D/g, '')
  if (digits.startsWith('98')) return `+${digits}`
  if (digits.startsWith('0')) return `+98${digits.slice(1)}`
  return `+98${digits}`
})

const landlineTel = computed(() => {
  if (!landline.value) return ''
  const digits = landline.value.replace(/\D/g, '')
  if (digits.startsWith('98')) return `+${digits}`
  if (digits.startsWith('0')) return `+98${digits.slice(1)}`
  return digits
})

async function submitMessage() {
  messageError.value = ''
  messageSuccess.value = ''
  const body = messageBody.value.trim()
  if (!body) {
    messageError.value = t('contact.messageNeedBody')
    return
  }
  sending.value = true
  try {
    await $fetch('/api/support/tickets', {
      method: 'POST',
      body: {
        body,
        name: messageName.value.trim() || user.value?.name || undefined,
        email: messageEmail.value.trim() || user.value?.email || undefined,
        pageUrl: import.meta.client ? window.location.href : '/contact',
      },
    })
    messageBody.value = ''
    messageSuccess.value = t('contact.messageTicketOk')
  } catch (err: unknown) {
    messageError.value = fetchErrorMessage(err, t('contact.messageTicketFail'), t)
  } finally {
    sending.value = false
  }
}

useHead({
  title: () => t('contact.title'),
})
</script>

<template>
  <div class="mx-auto max-w-2xl px-4 py-8">
    <h1 class="text-start text-2xl font-bold text-brand-navy">{{ t('contact.title') }}</h1>
    <p class="mt-1 text-start text-sm text-brand-gray-500">{{ t('legal.lastUpdated') }}</p>
    <p class="mt-3 text-start text-sm text-brand-gray-700">{{ t('contact.intro') }}</p>

    <dl class="mt-6 space-y-3 text-sm">
      <div
        v-if="ownerName"
        class="space-y-1 border border-brand-gray-200 bg-white p-4"
        style="border-radius: 2px;"
      >
        <dt class="font-bold text-brand-navy">{{ t('contact.ownerLabel') }}</dt>
        <dd class="text-brand-gray-700">{{ ownerName }}</dd>
      </div>

      <!-- Address: env only — never invent Tehran -->
      <div
        class="space-y-1 border border-brand-gray-200 bg-white p-4"
        style="border-radius: 2px;"
      >
        <dt class="font-bold text-brand-navy">{{ t('contact.addressLabel') }}</dt>
        <dd v-if="address" class="text-brand-gray-700">{{ address }}</dd>
        <dd v-else class="text-amber-800">{{ t('contact.addressPendingNote') }}</dd>
        <dd v-if="postalCode" class="text-brand-gray-600" dir="ltr">
          {{ t('contact.postalCodeLabel') }}: {{ postalCode }}
        </dd>
      </div>

      <div
        class="space-y-1 border border-brand-gray-200 bg-white p-4"
        style="border-radius: 2px;"
      >
        <dt class="font-bold text-brand-navy">{{ t('contact.landlineLabel') }}</dt>
        <dd v-if="landline">
          <a :href="`tel:${landlineTel}`" class="tabular-nums text-brand-primary" dir="ltr">{{ landline }}</a>
        </dd>
        <dd v-else class="text-amber-800">{{ t('contact.landlinePendingNote') }}</dd>
      </div>

      <div
        v-if="mobile"
        class="space-y-1 border border-brand-gray-200 bg-white p-4"
        style="border-radius: 2px;"
      >
        <dt class="font-bold text-brand-navy">{{ t('contact.mobileLabel') }}</dt>
        <dd>
          <a :href="`tel:${mobileTel}`" class="tabular-nums text-brand-primary" dir="ltr">{{ mobile }}</a>
        </dd>
      </div>

      <div
        class="space-y-1 border border-brand-gray-200 bg-white p-4"
        style="border-radius: 2px;"
      >
        <dt class="font-bold text-brand-navy">{{ t('contact.emailLabel') }}</dt>
        <dd class="space-y-2">
          <p
            v-for="row in contactEmails"
            :key="row.address"
            class="text-start text-sm"
          >
            <a :href="`mailto:${row.address}`" class="text-brand-primary" dir="ltr">{{ row.address }}</a>
            <span class="ms-2 text-brand-gray-600">{{ t(row.labelKey) }}</span>
          </p>
        </dd>
      </div>

      <div
        class="space-y-1 border border-brand-gray-200 bg-white p-4"
        style="border-radius: 2px;"
      >
        <dt class="font-bold text-brand-navy">{{ t('contact.hoursLabel') }}</dt>
        <dd class="text-brand-gray-700">{{ t('contact.hours') }}</dd>
      </div>
    </dl>

    <!-- Marketing message — only message field uses SmoothCaret -->
    <section
      class="mt-6 space-y-3 border border-brand-gray-200 bg-white p-4"
      style="border-radius: 2px;"
    >
      <h2 class="text-start text-base font-bold text-brand-navy">{{ t('contact.messageTitle') }}</h2>
      <p class="text-start text-sm text-brand-gray-600">{{ t('contact.messageIntro') }}</p>
      <form class="space-y-3" @submit.prevent="submitMessage">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block text-start text-xs font-bold text-brand-gray-600">
            {{ t('contact.messageNameLabel') }}
            <input
              v-model="messageName"
              type="text"
              class="neo-input mt-1 bg-white/95"
              style="border-radius: 2px;"
              autocomplete="name"
            >
          </label>
          <label class="block text-start text-xs font-bold text-brand-gray-600">
            {{ t('contact.messageEmailLabel') }}
            <input
              v-model="messageEmail"
              type="email"
              dir="ltr"
              class="neo-input mt-1 bg-white/95"
              style="border-radius: 2px;"
              autocomplete="email"
            >
          </label>
        </div>
        <label class="block text-start text-xs font-bold text-brand-gray-600">
          {{ t('contact.messageLabel') }}
          <SmoothCaretInput
            id="contact-message"
            v-model="messageBody"
            class="mt-1"
            multiline
            :rows="4"
            dir="rtl"
            :placeholder="t('contact.messagePlaceholder')"
            required
          />
        </label>
        <p v-if="messageError" class="text-start text-xs font-bold text-brand-primary">{{ messageError }}</p>
        <p v-else-if="messageSuccess" class="text-start text-xs font-bold text-emerald-800">{{ messageSuccess }}</p>
        <button type="submit" class="canva-cta w-full sm:w-auto" :disabled="sending">
          {{ sending ? t('common.loading') : t('contact.messageSubmit') }}
        </button>
      </form>
    </section>

    <!-- Trust readiness: Enamad / SMS / IPG — cannot lie -->
    <section
      class="mt-6 space-y-3 border border-brand-gray-200 bg-white p-4"
      style="border-radius: 2px;"
    >
      <h2 class="text-start text-base font-bold text-brand-navy">{{ t('contact.readinessTitle') }}</h2>

      <div class="space-y-1 text-sm">
        <p class="font-bold text-brand-navy">{{ t('legal.enamad') }}</p>
        <div v-if="enamadReady" class="flex justify-start">
          <EnamadBadge />
        </div>
        <p v-else class="text-amber-800">{{ t('contact.enamadPendingNote') }}</p>
      </div>

      <div class="space-y-1 text-sm">
        <p class="font-bold text-brand-navy">{{ t('contact.smsReadinessLabel') }}</p>
        <p class="text-brand-gray-700">
          {{ smsLive ? t('contact.smsReadyMulti') : t('contact.smsReadySingle') }}
          <span class="ms-1 text-xs text-brand-gray-500" dir="ltr">({{ smsPhase }})</span>
        </p>
      </div>

      <div class="space-y-1 text-sm">
        <p class="font-bold text-brand-navy">{{ t('contact.ipgReadinessLabel') }}</p>
        <p class="text-brand-gray-700">
          {{ ipgReadinessCopy() }}
          <span class="ms-1 text-xs text-brand-gray-500" dir="ltr">({{ paymentsMode }})</span>
        </p>
      </div>
    </section>

    <p class="mt-6 text-start">
      <NuxtLink :to="localePath('/complaints')" class="font-bold text-brand-primary underline">
        {{ t('legal.complaints') }}
      </NuxtLink>
      <span class="mx-2 text-brand-gray-300" aria-hidden="true">·</span>
      <NuxtLink :to="localePath('/privacy')" class="font-bold text-brand-primary underline">
        {{ t('legal.privacy') }}
      </NuxtLink>
      <span class="mx-2 text-brand-gray-300" aria-hidden="true">·</span>
      <NuxtLink :to="localePath('/terms')" class="font-bold text-brand-primary underline">
        {{ t('legal.terms') }}
      </NuxtLink>
    </p>
    <p class="mt-8 text-start text-sm text-brand-gray-500">{{ t('legal.disclaimer') }}</p>
  </div>
</template>
