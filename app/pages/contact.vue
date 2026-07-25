<script setup lang="ts">
definePageMeta({ layout: 'default' })

const { t } = useI18n()
const localePath = useLocalePath()
const config = useRuntimeConfig()
const { multiReady, smsPhase } = useSmsCapability()

const ownerName = computed(() => String(config.public.contactOwnerName || '').trim())
const address = computed(() => String(config.public.contactAddress || '').trim())
const postalCode = computed(() => String(config.public.contactPostalCode || '').trim())
const landline = computed(() => String(config.public.contactLandline || '').trim())
const mobile = computed(() => String(config.public.contactMobile || '').trim())
const email = computed(() => String(config.public.contactEmail || '').trim())

const enamadReady = computed(() =>
  Boolean(String(config.public.enamadId || '').trim() && String(config.public.enamadCode || '').trim()),
)

const paymentsMode = computed(() => String(config.public.paymentsMode || 'pay_at_club').trim())
const ipgLive = computed(() => paymentsMode.value === 'live')

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
        v-if="email"
        class="space-y-1 border border-brand-gray-200 bg-white p-4"
        style="border-radius: 2px;"
      >
        <dt class="font-bold text-brand-navy">{{ t('contact.emailLabel') }}</dt>
        <dd class="space-y-1">
          <a :href="`mailto:${email}`" class="block text-brand-primary" dir="ltr">{{ email }}</a>
          <a href="mailto:support@inboxs.ir" class="block text-brand-primary" dir="ltr">support@inboxs.ir</a>
          <a href="mailto:privacy@inboxs.ir" class="block text-brand-primary" dir="ltr">privacy@inboxs.ir</a>
          <a href="mailto:complaints@inboxs.ir" class="block text-brand-primary" dir="ltr">complaints@inboxs.ir</a>
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
          {{ multiReady ? t('contact.smsReadyMulti') : t('contact.smsReadySingle') }}
          <span class="ms-1 text-xs text-brand-gray-500" dir="ltr">({{ smsPhase }})</span>
        </p>
      </div>

      <div class="space-y-1 text-sm">
        <p class="font-bold text-brand-navy">{{ t('contact.ipgReadinessLabel') }}</p>
        <p class="text-brand-gray-700">
          {{ ipgLive ? t('contact.ipgReadyLive') : t('contact.ipgReadyPayAtClub') }}
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
