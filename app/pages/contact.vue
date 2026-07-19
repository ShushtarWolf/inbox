<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const config = useRuntimeConfig()

const ownerName = computed(() => String(config.public.contactOwnerName || '').trim())
const address = computed(() =>
  String(config.public.contactAddress || '').trim() || t('contact.addressDefault'),
)
const postalCode = computed(() => String(config.public.contactPostalCode || '').trim())
const landline = computed(() => String(config.public.contactLandline || '').trim())
const mobile = computed(() =>
  String(config.public.contactMobile || '').trim() || t('contact.mobileDefault'),
)
const email = computed(() =>
  String(config.public.contactEmail || '').trim() || t('contact.emailDefault'),
)

const mobileTel = computed(() => {
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
</script>

<template>
  <div class="prose prose-sm mx-auto max-w-2xl px-4 py-8">
    <h1>{{ t('contact.title') }}</h1>
    <p class="text-sm text-brand-muted">{{ t('legal.lastUpdated') }}</p>
    <p>{{ t('contact.intro') }}</p>

    <dl class="mt-6 not-prose space-y-4 text-sm">
      <div v-if="ownerName" class="ios-card space-y-1 p-4">
        <dt class="font-bold text-brand-navy">{{ t('contact.ownerLabel') }}</dt>
        <dd class="text-brand-gray-700">{{ ownerName }}</dd>
      </div>

      <div class="ios-card space-y-1 p-4">
        <dt class="font-bold text-brand-navy">{{ t('contact.addressLabel') }}</dt>
        <dd class="text-brand-gray-700">{{ address }}</dd>
        <dd v-if="postalCode" class="text-brand-gray-600" dir="ltr">
          {{ t('contact.postalCodeLabel') }}: {{ postalCode }}
        </dd>
      </div>

      <div v-if="landline" class="ios-card space-y-1 p-4">
        <dt class="font-bold text-brand-navy">{{ t('contact.landlineLabel') }}</dt>
        <dd>
          <a :href="`tel:${landlineTel}`" class="tabular-nums text-brand-primary" dir="ltr">{{ landline }}</a>
        </dd>
      </div>

      <div class="ios-card space-y-1 p-4">
        <dt class="font-bold text-brand-navy">{{ t('contact.mobileLabel') }}</dt>
        <dd>
          <a :href="`tel:${mobileTel}`" class="tabular-nums text-brand-primary" dir="ltr">{{ mobile }}</a>
        </dd>
      </div>

      <div class="ios-card space-y-1 p-4">
        <dt class="font-bold text-brand-navy">{{ t('contact.emailLabel') }}</dt>
        <dd class="space-y-1">
          <a :href="`mailto:${email}`" class="block text-brand-primary" dir="ltr">{{ email }}</a>
          <a href="mailto:support@inboxs.ir" class="block text-brand-primary" dir="ltr">support@inboxs.ir</a>
          <a href="mailto:privacy@inboxs.ir" class="block text-brand-primary" dir="ltr">privacy@inboxs.ir</a>
          <a href="mailto:complaints@inboxs.ir" class="block text-brand-primary" dir="ltr">complaints@inboxs.ir</a>
        </dd>
      </div>

      <div class="ios-card space-y-1 p-4">
        <dt class="font-bold text-brand-navy">{{ t('contact.hoursLabel') }}</dt>
        <dd class="text-brand-gray-700">{{ t('contact.hours') }}</dd>
      </div>
    </dl>

    <p class="mt-6">
      <NuxtLink :to="localePath('/complaints')" class="font-bold text-brand-primary underline">
        {{ t('legal.complaints') }}
      </NuxtLink>
    </p>
    <div class="mt-6 not-prose flex justify-center">
      <EnamadBadge />
    </div>
    <p class="mt-8 text-sm text-brand-muted">{{ t('legal.disclaimer') }}</p>
  </div>
</template>
