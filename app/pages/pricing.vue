<script setup lang="ts">
const { t } = useI18n()

useSeoMeta({
  title: () => t('legal.pricingTitle'),
  description: () => t('legal.pricingSeoDescription'),
  ogTitle: () => t('legal.pricingTitle'),
  ogDescription: () => t('legal.pricingSeoDescription'),
})
</script>

<template>
  <div>
    <LegalDocument
      title-key="legal.pricingTitle"
      intro-key="legal.pricingIntro"
      sections-key="legal.pricingSections"
    />
    <LegalFaq faq-key="legal.pricingFaq" page-url-path="/pricing" />
  </div>
</template>
