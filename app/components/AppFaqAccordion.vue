<script setup lang="ts">
import { splitFaqAnswerLinks, type FaqAnswerPart } from '#shared/faqAnswerLinks.ts'

export type AppFaqItem = {
  question: string
  answer: string
}

const props = withDefaults(defineProps<{
  items: AppFaqItem[]
  headingId?: string
  /** When set, renders an h2/h3 heading above the accordion. */
  heading?: string
  headingLevel?: 'h2' | 'h3'
}>(), {
  headingId: 'app-faq-heading',
  headingLevel: 'h2',
})

const localePath = useLocalePath()
const config = useRuntimeConfig()
const siteBase = computed(() => String(config.public.siteUrl || '').replace(/\/$/, '') || 'https://inboxs.ir')

/** One open panel at a time; null = all closed (default). */
const openIndex = ref<number | null>(null)

function toggle(idx: number) {
  openIndex.value = openIndex.value === idx ? null : idx
}

function isOpen(idx: number) {
  return openIndex.value === idx
}

function answerParts(answer: string): FaqAnswerPart[] {
  return splitFaqAnswerLinks(answer, siteBase.value)
}

function linkTo(part: Extract<FaqAnswerPart, { type: 'link' }>) {
  return localePath(part.path)
}
</script>

<template>
  <div v-if="items.length" class="canva-faq" :aria-labelledby="heading ? headingId : undefined">
    <component
      :is="headingLevel"
      v-if="heading"
      :id="headingId"
      class="canva-faq-title"
    >
      {{ heading }}
    </component>

    <div class="canva-faq-list">
      <div
        v-for="(item, idx) in items"
        :key="idx"
        class="canva-faq-item"
      >
        <button
          type="button"
          class="canva-faq-trigger"
          :aria-expanded="isOpen(idx)"
          :aria-controls="`${headingId}-panel-${idx}`"
          :id="`${headingId}-trigger-${idx}`"
          @click="toggle(idx)"
        >
          <span class="canva-faq-question">{{ item.question }}</span>
          <AppIcon
            name="expand_more"
            size="sm"
            class="canva-faq-chevron"
            :class="{ 'canva-faq-chevron-open': isOpen(idx) }"
          />
        </button>
        <div
          v-show="isOpen(idx)"
          :id="`${headingId}-panel-${idx}`"
          role="region"
          :aria-labelledby="`${headingId}-trigger-${idx}`"
          class="canva-faq-panel"
        >
          <p class="canva-faq-answer">
            <template v-for="(part, pIdx) in answerParts(item.answer)" :key="pIdx">
              <NuxtLink
                v-if="part.type === 'link'"
                :to="linkTo(part)"
                class="canva-faq-link"
              >
                {{ part.label }}
              </NuxtLink>
              <template v-else>{{ part.value }}</template>
            </template>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
