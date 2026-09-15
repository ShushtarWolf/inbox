<script setup lang="ts">
import { serializeJsonLd } from '#shared/jsonLd.ts'

const props = defineProps<{
  faqKey: string
  pageUrlPath: string
}>()

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
  <section v-if="items.length" class="prose prose-sm mx-auto max-w-2xl px-4 pb-10" aria-labelledby="legal-faq-heading">
    <h2 id="legal-faq-heading">{{ t('legal.faqHeading') }}</h2>
    <div v-for="(item, idx) in items" :key="idx" class="mt-4">
      <h3 class="text-base">{{ item.question }}</h3>
      <p class="mt-1">{{ item.answer }}</p>
    </div>
  </section>
</template>
