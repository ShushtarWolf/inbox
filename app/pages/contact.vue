<script setup lang="ts">
definePageMeta({ layout: 'default' })

const { formatPhone } = useFormatters()
const { t } = useI18n()
const localePath = useLocalePath()
const config = useRuntimeConfig()
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
  const rows: Array<{ address: string; labelKey: string }> = CONTACT_EMAILS.map((row) => ({
    address: row.address,
    labelKey: row.labelKey,
  }))
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
/** Honeypot — hidden from users; bots that fill it are silently discarded server-side. */
const honeypot = ref('')

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
        website: honeypot.value,
      },
    })
    messageBody.value = ''
    messageSuccess.value = t('contact.messageTicketOk')
  } catch (err: unknown) {
    messageError.value = fetchErrorMessage(err, t('contact.messageTicketFail'))
  } finally {
    sending.value = false
  }
}

useHead({
  title: () => t('contact.title'),
})
</script>

<template>
  <div class="tail-page-stack">
    <CanvaPublicChrome />
  <div class="canva-legal canva-contact">
    <h1>{{ t('contact.title') }}</h1>
    <p class="canva-legal-meta">{{ t('legal.lastUpdated') }}</p>
    <p class="mt-3 text-start text-sm text-brand-gray-700">{{ t('contact.intro') }}</p>

    <dl class="canva-contact-card canva-contact-kv">
      <div
        v-if="ownerName"
        class="canva-contact-row"
        style="border-radius: 2px;"
      >
        <dt class="font-bold text-brand-navy">{{ t('contact.ownerLabel') }}</dt>
        <dd class="text-brand-gray-700">{{ ownerName }}</dd>
      </div>

      <!-- Address: env only — never invent Tehran; hide when unset (no setup copy to users) -->
      <div
        v-if="address"
        class="canva-contact-row"
        style="border-radius: 2px;"
      >
        <dt class="font-bold text-brand-navy">{{ t('contact.addressLabel') }}</dt>
        <dd class="text-brand-gray-700">{{ address }}</dd>
        <dd v-if="postalCode" class="text-brand-gray-600" dir="ltr">
          {{ t('contact.postalCodeLabel') }}: {{ postalCode }}
        </dd>
      </div>

      <div
        v-if="landline"
        class="canva-contact-row"
        style="border-radius: 2px;"
      >
        <dt class="font-bold text-brand-navy">{{ t('contact.landlineLabel') }}</dt>
        <dd>
          <a :href="`tel:${landlineTel}`" class="tabular-nums text-brand-primary" dir="ltr">{{ landline }}</a>
        </dd>
      </div>

      <div
        v-if="mobile"
        class="canva-contact-row"
        style="border-radius: 2px;"
      >
        <dt class="font-bold text-brand-navy">{{ t('contact.mobileLabel') }}</dt>
        <dd>
          <a :href="`tel:${mobileTel}`" class="tabular-nums text-brand-primary" dir="ltr">{{ formatPhone(mobile) }}</a>
        </dd>
      </div>

      <div
        v-for="(row, ri) in contactEmails"
        :key="row.address"
        class="canva-contact-row"
        style="border-radius: 2px;"
      >
        <dt class="font-bold text-brand-navy">{{ ri === 0 ? `${t('contact.emailLabel')} — ${t(row.labelKey)}` : t(row.labelKey) }}</dt>
        <dd>
          <a :href="`mailto:${row.address}`" class="text-brand-primary" dir="ltr">{{ row.address }}</a>
        </dd>
      </div>

      <div
        class="canva-contact-row"
        style="border-radius: 2px;"
      >
        <dt class="font-bold text-brand-navy">{{ t('contact.hoursLabel') }}</dt>
        <dd class="text-brand-gray-700">{{ t('contact.hours') }}</dd>
      </div>
    </dl>

    <!-- Marketing message — only message field uses SmoothCaret -->
    <section class="canva-contact-card space-y-3">
      <h2 class="text-start text-base font-bold text-brand-navy">{{ t('contact.messageTitle') }}</h2>
      <p class="text-start text-sm text-brand-gray-600">{{ t('contact.messageIntro') }}</p>
      <form class="space-y-3" @submit.prevent="submitMessage">
        <div class="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
          <label>
            Website
            <input
              v-model="honeypot"
              type="text"
              name="website"
              tabindex="-1"
              autocomplete="off"
            >
          </label>
        </div>
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

    <!-- Trust: only user-facing facts — never raw config/env values or setup notes. -->
    <section class="canva-contact-card space-y-3">
      <h2 class="text-start text-base font-bold text-brand-navy">{{ t('contact.readinessTitle') }}</h2>

      <div v-if="enamadReady" class="space-y-1 text-sm">
        <p class="font-bold text-brand-navy">{{ t('legal.enamad') }}</p>
        <div class="flex justify-start">
          <EnamadBadge />
        </div>
      </div>

      <div class="space-y-1 text-sm">
        <p class="font-bold text-brand-navy">{{ t('contact.ipgReadinessLabel') }}</p>
        <p class="text-brand-gray-700">{{ ipgReadinessCopy() }}</p>
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
  </div>
</template>

<style scoped>
/* SoT pages.contact .card .kv: label (silver) right, value bold left, hairline rows */
.canva-contact-kv { background: #fff; border: 1px solid rgba(44,44,42,.1); padding: 18px; margin-top: 20px; }
.canva-contact-kv :deep(.canva-contact-row), .canva-contact-kv .canva-contact-row {
  display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
  font-size: 12.5px; padding: 9px 0; border-bottom: 1px solid rgba(44,44,42,.06);
  background: transparent; box-shadow: none; border-radius: 0 !important; margin: 0;
}
.canva-contact-kv .canva-contact-row dt { font-weight: 400; color: #8a8a86; }
.canva-contact-kv .canva-contact-row dd, .canva-contact-kv .canva-contact-row dd a { font-weight: 700; color: #2c2c2a; margin: 0; }
</style>
