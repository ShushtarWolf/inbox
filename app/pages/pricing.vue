<script setup lang="ts">
const { t } = useI18n()
const config = useRuntimeConfig()
const siteBase = computed(() => String(config.public.siteUrl || '').replace(/\/$/, '') || 'https://inboxs.ir')

useSeoMeta({
  title: () => t('legal.pricingSeoTitle'),
  description: () => t('legal.pricingSeoDescription'),
  ogTitle: () => t('legal.pricingSeoTitle'),
  ogDescription: () => t('legal.pricingSeoDescription'),
})

useHead(() => ({
  link: [{ rel: 'canonical', href: `${siteBase.value}/pricing` }],
}))
</script>

<template>
  <div>
    <LegalDocument
      title-key="legal.pricingTitle"
      intro-key="legal.pricingIntro"
      sections-key="legal.pricingSections"
      :manage-title="false"
    />
    <LegalFaq faq-key="legal.pricingFaq" page-url-path="/pricing" />
  </div>
</template>
