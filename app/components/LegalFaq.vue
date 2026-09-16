<script setup lang="ts">
import { serializeJsonLd } from '#shared/jsonLd.ts'

const props = withDefaults(defineProps<{
  faqKey: string
  pageUrlPath: string
  /** Show city/sport hub chips under the Help heading (home + clubs list). */
  withHubDiscovery?: boolean
}>(), {
  withHubDiscovery: false,
})

const { t, tm, rt } = useI18n()
const config = useRuntimeConfig()

type FaqItem = { question: string; answer: string }

const items = computed(() => {
  const raw = tm(props.faqKey) as FaqItem[] | FaqItem
  if (!Array.isArray(raw)) return [] as FaqItem[]
  return raw.map((item) => ({
    question: normalize(typeof item.question === 'string' ? item.question : rt(item.question)),
    answer: normalize(typeof item.answer === 'string' ? item.answer : rt(item.answer)),
  }))
})

function normalize(text: string) {
  return text.replace(/\{'@'\}/g, '@')
}

const siteBase = computed(() => String(config.public.siteUrl || '').replace(/\/$/, '') || 'https://inboxs.ir')
const showSection = computed(() => items.value.length > 0 || props.withHubDiscovery)

useHead(() => {
  if (!items.value.length) return {}
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.value.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
    url: `${siteBase.value}${props.pageUrlPath}`,
  }
  return {
    script: [{ type: 'application/ld+json', innerHTML: serializeJsonLd(jsonLd) }],
  }
})
</script>

<template>
  <section
    v-if="showSection"
    class="canva-help"
    :aria-labelledby="withHubDiscovery ? 'legal-help-heading' : 'legal-faq-heading'"
  >
    <template v-if="withHubDiscovery">
      <h2 id="legal-help-heading" class="canva-help-title">{{ t('legal.helpHeading') }}</h2>
      <GeoSportHubDiscoveryNav />
      <AppFaqAccordion
        v-if="items.length"
        :items="items"
        heading-id="legal-faq-heading"
        :heading="t('legal.faqHeading')"
        heading-level="h3"
      />
    </template>
    <AppFaqAccordion
      v-else-if="items.length"
      :items="items"
      heading-id="legal-faq-heading"
      :heading="t('legal.faqHeading')"
      heading-level="h2"
    />
  </section>
</template>
