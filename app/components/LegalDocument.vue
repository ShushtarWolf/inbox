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
  return rt(para)
}

const sections = computed(() => {
  const raw = tm(props.sectionsKey) as LegalSection[] | LegalSection
  return Array.isArray(raw) ? raw : []
})

watchEffect(() => {
  if (props.sectionsKey !== 'legal.termsSections') return
  // #region agent log
  fetch('http://127.0.0.1:7459/ingest/150d6ec9-7ea4-4890-8fdc-843d504b2806',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9cb647'},body:JSON.stringify({sessionId:'9cb647',runId:'gap-fill',hypothesisId:'A',location:'LegalDocument.vue',message:'terms payments copy',data:{paymentsMode:paymentsMode.value,mapped:mapParagraph('__PAYMENTS_STATUS__').slice(0,80)},timestamp:Date.now()})}).catch(()=>{})
  // #endregion
})
</script>

<template>
  <div class="prose prose-sm mx-auto max-w-2xl px-4 py-8">
    <h1>{{ t(titleKey) }}</h1>
    <p class="text-sm text-brand-muted">{{ t('legal.lastUpdated') }}</p>
    <p>{{ t(introKey) }}</p>
    <section v-for="(section, idx) in sections" :key="idx" class="mt-6">
      <h2>{{ rt(section.title) }}</h2>
      <p v-for="(para, pidx) in section.paragraphs" :key="pidx" class="mt-2">{{ mapParagraph(para) }}</p>
    </section>
    <p class="mt-8 text-sm text-brand-muted">{{ t('legal.disclaimer') }}</p>
  </div>
</template>
