<script setup lang="ts">
import {
  PUBLIC_SKILL_ASSESSMENT_SLUGS,
  publicSkillNameFa,
  serializeSkillAssessmentHeadScripts,
  skillAssessmentHubDescription,
  skillAssessmentHubFaq,
  skillAssessmentHubTitle,
} from '#shared/skillAssessmentSeo.ts'

definePageMeta({ layout: 'default' })

const { t } = useI18n()
const localePath = useLocalePath()
const config = useRuntimeConfig()
const siteBase = computed(() => String(config.public.siteUrl || '').replace(/\/$/, '') || 'https://inboxs.ir')

const pagePath = '/skill-assessment'
const title = skillAssessmentHubTitle()
const description = skillAssessmentHubDescription()
const faq = skillAssessmentHubFaq()

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogSiteName: () => t('home.ogSiteName'),
  ogUrl: () => `${siteBase.value}${pagePath}`,
  ogImage: () => `${siteBase.value}/hero/tennis-court.jpg`,
  ogType: 'website',
  twitterCard: 'summary_large_image',
  robots: 'index, follow',
})

useHead(() => ({
  link: [{ rel: 'canonical', href: `${siteBase.value}${pagePath}` }],
  script: serializeSkillAssessmentHeadScripts(
    siteBase.value,
    pagePath,
    title,
    description,
    faq,
    [
      { name: t('nav.home'), path: '/' },
      { name: 'تعیین سطح آنلاین', path: pagePath },
    ],
  ).map((innerHTML) => ({ type: 'application/ld+json', innerHTML })),
}))
</script>

<template>
  <div class="tail-page-stack space-y-8">
    <CanvaPublicChrome back-to="/" />

    <header class="space-y-2 text-start">
      <p class="text-xs font-bold text-brand-gray-500">
        اینباکس · هم‌بازی و رزرو زمین
      </p>
      <h1 class="text-xl font-bold text-brand-navy min-[431px]:text-2xl">
        {{ title }}
      </h1>
      <p class="max-w-2xl text-sm leading-relaxed text-brand-gray-500">
        {{ description }}
      </p>
    </header>

    <section class="space-y-3">
      <h2 class="text-base font-bold text-brand-navy">
        انتخاب ورزش
      </h2>
      <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="slug in PUBLIC_SKILL_ASSESSMENT_SLUGS" :key="slug">
          <NuxtLink
            :to="localePath(`/skill-assessment/${slug}`)"
            class="flex h-full flex-col border border-brand-gray-200 bg-white p-4 transition hover:border-brand-primary"
          >
            <span class="text-base font-bold text-brand-navy">
              تعیین سطح {{ publicSkillNameFa(slug) }}
            </span>
            <span class="mt-1 text-xs text-brand-gray-500">
              ۶ سوال · نتیجه فوری · رایگان
            </span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <SkillAssessmentLevelGuide />

    <section class="space-y-3 text-start">
      <h2 class="text-base font-bold text-brand-navy">
        سؤالات متداول
      </h2>
      <ul class="space-y-3">
        <li
          v-for="(item, idx) in faq"
          :key="idx"
          class="border border-brand-gray-200 bg-brand-cream p-4"
        >
          <p class="text-sm font-bold text-brand-navy">
            {{ item.question }}
          </p>
          <p class="mt-2 text-sm leading-relaxed text-brand-gray-500">
            {{ item.answer }}
          </p>
        </li>
      </ul>
    </section>
  </div>
</template>