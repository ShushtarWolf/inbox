<script setup lang="ts">
import { serializeBrandJsonLd } from '#shared/brandJsonLd.ts'

const { t } = useI18n()
const config = useRuntimeConfig()
const ownerName = computed(() => String(config.public.contactOwnerName || '').trim())
const siteBase = computed(() => String(config.public.siteUrl || '').replace(/\/$/, '') || 'https://inboxs.ir')

useSeoMeta({
  title: () => t('legal.aboutSeoTitle'),
  description: () => t('legal.aboutSeoDescription'),
  ogTitle: () => t('legal.aboutSeoTitle'),
  ogDescription: () => t('legal.aboutSeoDescription'),
  ogSiteName: () => t('home.ogSiteName'),
  ogUrl: () => `${siteBase.value}/about`,
  ogImage: () => `${siteBase.value}/hero/tennis-court.jpg`,
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterImage: () => `${siteBase.value}/hero/tennis-court.jpg`,
})

useHead(() => ({
  link: [{ rel: 'canonical', href: `${siteBase.value}/about` }],
  script: [{
    type: 'application/ld+json',
    innerHTML: serializeBrandJsonLd({
      siteUrl: siteBase.value,
      description: t('home.brandJsonLdDescription'),
      appOfferDescription: t('home.seoTldr'),
    }),
  }],
}))
</script>

<template>
  <div class="tail-page-stack">
    <CanvaPublicChrome />
    <LegalDocument
      title-key="legal.aboutTitle"
      intro-key="legal.aboutIntro"
      sections-key="legal.aboutSections"
      :manage-title="false"
      :show-chrome="false"
    >
      <template #before-disclaimer>
        <div class="legal-sot-faq">
          <LegalFaq faq-key="legal.aboutFaq" page-url-path="/about" />
        </div>
      <p v-if="ownerName" class="about-operator-line">
        <span class="font-bold text-brand-navy">{{ t('contact.ownerLabel') }}: </span>
        {{ ownerName }}
      </p>
      </template>
    </LegalDocument>
  </div>
</template>


<style scoped>
.about-operator-line { margin: 20px 0 0; font-size: 13px; line-height: 2; color: #5f5e5a; text-align: start; }
</style>
