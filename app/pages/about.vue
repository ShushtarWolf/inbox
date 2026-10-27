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
    <div v-if="ownerName" class="prose prose-sm mx-auto max-w-2xl px-4 pt-2">
      <p class="ios-card not-prose p-4 text-sm">
        <span class="font-bold text-brand-navy">{{ t('contact.ownerLabel') }}: </span>
        {{ ownerName }}
      </p>
    </div>
    <LegalDocument
      title-key="legal.aboutTitle"
      intro-key="legal.aboutIntro"
      sections-key="legal.aboutSections"
      :manage-title="false"
      :show-chrome="false"
    />
    <div class="legal-sot-faq">
      <LegalFaq faq-key="legal.aboutFaq" page-url-path="/about" />
    </div>
  </div>
</template>

<style scoped>
/* SoT legalPage(): plain .rfaq rows (summary marker, hairline bottom), h2 17px dark */
.legal-sot-faq { max-width: 640px; margin: -24px auto 0; padding: 0; width: 100%; }
.legal-sot-faq :deep(.canva-help) { padding: 0; margin: 0; max-width: none; }
.legal-sot-faq :deep(.canva-faq-title) { font-size: 17px; color: #2c2c2a; margin: 0 0 6px; }
.legal-sot-faq :deep(.canva-faq-list) { gap: 0; display: block; }
.legal-sot-faq :deep(.canva-faq-item) { background: transparent; border: 0; border-bottom: 1px solid rgba(44,44,42,.08); border-radius: 0; box-shadow: none; margin: 0; }
.legal-sot-faq :deep(.canva-faq-trigger) { padding: 12px 0; justify-content: flex-start; gap: 6px; font-weight: 600; font-size: 14px; }
.legal-sot-faq :deep(.canva-faq-trigger)::before { content: '\25C2'; font-size: 11px; order: -1; }
.legal-sot-faq :deep(.canva-faq-chevron) { display: none; }
.legal-sot-faq :deep(.canva-faq-panel) { padding: 0 0 12px; }
</style>
