<script setup lang="ts">
const props = defineProps<{
  titleKey: string
  introKey: string
  sectionsKey: string
}>()

const { t, tm, rt } = useI18n()
const config = useRuntimeConfig()
const { data: paymentsModePayload } = useFetch<{ mode?: string }>('/api/payments/mode', {
  default: () => ({ mode: String(config.public.paymentsMode || 'pay_at_club') }),
})

type LegalSection = { title: string; paragraphs: string[] }

const paymentsMode = computed(() => {
  const live = String(paymentsModePayload.value?.mode || config.public.paymentsMode || 'pay_at_club').trim()
  return live === 'live' || live === 'test' || live === 'pay_at_club' ? live : 'pay_at_club'
})

function mapParagraph(para: string) {
  const raw = typeof para === 'string' ? para : rt(para)
  if (raw === '__PAYMENTS_STATUS__') {
    if (paymentsMode.value === 'live') return t('legal.termsPayStatusLive')
    if (paymentsMode.value === 'test') return t('legal.termsPayStatusTest')
    return t('legal.termsPayStatusPayAtClub')
  }
  if (raw === '__PAYMENTS_PROVIDER__') return t('legal.termsPayProvider')
  return normalizeLegalText(typeof para === 'string' ? para : rt(para))
}

/** tm() returns raw JSON strings; linked @ syntax is not compiled until rendered. */
function normalizeLegalText(text: string) {
  return text.replace(/\{'@'\}/g, '@')
}

const sections = computed(() => {
  const raw = tm(props.sectionsKey) as LegalSection[] | LegalSection
  return Array.isArray(raw) ? raw : []
})
</script>

<template>
  <div class="prose prose-sm mx-auto max-w-2xl px-4 py-8">
    <h1>{{ t(titleKey) }}</h1>
    <p class="text-sm text-brand-muted">{{ t('legal.lastUpdated') }}</p>
    <p>{{ t(introKey) }}</p>
    <section v-for="(section, idx) in sections" :key="idx" class="mt-6">
      <h2>{{ normalizeLegalText(rt(section.title)) }}</h2>
      <p v-for="(para, pidx) in section.paragraphs" :key="pidx" class="mt-2">{{ mapParagraph(para) }}</p>
    </section>
    <p class="mt-8 text-sm text-brand-muted">{{ t('legal.disclaimer') }}</p>
  </div>
</template>
