<script setup lang="ts">
const props = defineProps<{
  titleKey: string
  introKey: string
  sectionsKey: string
}>()

const { t, tm, rt } = useI18n()

type LegalSection = { title: string; paragraphs: string[] }

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
      <h2>{{ rt(section.title) }}</h2>
      <p v-for="(para, pidx) in section.paragraphs" :key="pidx" class="mt-2">{{ rt(para) }}</p>
    </section>
    <p class="mt-8 text-sm text-brand-muted">{{ t('legal.disclaimer') }}</p>
  </div>
</template>
