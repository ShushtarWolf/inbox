<script setup lang="ts">
import {
  isPublicSkillAssessmentSlug,
  PUBLIC_SKILL_ASSESSMENT_SLUGS,
  publicSkillNameFa,
  serializeSkillAssessmentHeadScripts,
  skillAssessmentSportDescription,
  skillAssessmentSportFaq,
  skillAssessmentSportH1,
  skillAssessmentSportTitle,
} from '#shared/skillAssessmentSeo.ts'

definePageMeta({
  layout: 'default',
  pageTransition: { name: 'page', mode: 'default' },
})

const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const config = useRuntimeConfig()
const { user, fetch: fetchAuth } = useAuth()

const sportSlug = computed(() => String(route.params.sport || '').toLowerCase())

if (!isPublicSkillAssessmentSlug(sportSlug.value)) {
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
}

const sportNameFa = computed(() => publicSkillNameFa(sportSlug.value))
const pagePath = computed(() => `/skill-assessment/${sportSlug.value}`)
const siteBase = computed(() => String(config.public.siteUrl || '').replace(/\/$/, '') || 'https://inboxs.ir')

const title = computed(() => skillAssessmentSportTitle(sportSlug.value))
const description = computed(() => skillAssessmentSportDescription(sportSlug.value))
const h1 = computed(() => skillAssessmentSportH1(sportSlug.value))
const faq = computed(() => skillAssessmentSportFaq(sportSlug.value))

const otherSports = computed(() =>
  PUBLIC_SKILL_ASSESSMENT_SLUGS.filter((s) => s !== sportSlug.value),
)

/** Non-blocking: wizard uses static questionnaires; catalog only for logged-in save. */
const { data: sportCatalog } = useFetch<Array<{ id: string, slug: string, nameFa: string }>>(
  '/api/sports',
  { lazy: true, server: false },
)

function warmSportRoute(slug: string) {
  if (!import.meta.client) return
  void preloadRouteComponents(localePath(`/skill-assessment/${slug}`))
}

const sportId = computed(() => sportCatalog.value?.find((s) => s.slug === sportSlug.value)?.id || null)

useSeoMeta({
  title: () => title.value,
  description: () => description.value,
  ogTitle: () => title.value,
  ogDescription: () => description.value,
  ogSiteName: () => t('home.ogSiteName'),
  ogUrl: () => `${siteBase.value}${pagePath.value}`,
  ogImage: () => `${siteBase.value}/hero/tennis-court.jpg`,
  ogType: 'website',
  twitterCard: 'summary_large_image',
  robots: 'index, follow',
})

useHead(() => ({
  link: [{ rel: 'canonical', href: `${siteBase.value}${pagePath.value}` }],
  script: serializeSkillAssessmentHeadScripts(
    siteBase.value,
    pagePath.value,
    h1.value,
    description.value,
    faq.value,
    [
      { name: t('nav.home'), path: '/' },
      { name: 'تعیین سطح آنلاین', path: '/skill-assessment' },
      { name: sportNameFa.value, path: pagePath.value },
    ],
  ).map((innerHTML) => ({ type: 'application/ld+json', innerHTML })),
}))

onMounted(() => {
  if (!user.value) fetchAuth()
})
</script>

<template>
  <div class="tail-page-stack space-y-8">
    <CanvaPublicChrome back-to="/skill-assessment" />

    <header class="space-y-3 text-start">
      <nav class="text-xs font-bold text-brand-gray-500" aria-label="مسیر">
        <NuxtLink :to="localePath('/')" class="hover:text-brand-primary">
          {{ t('nav.home') }}
        </NuxtLink>
        <span aria-hidden="true"> / </span>
        <NuxtLink :to="localePath('/skill-assessment')" class="hover:text-brand-primary">
          تعیین سطح
        </NuxtLink>
        <span aria-hidden="true"> / </span>
        <span class="text-brand-navy">{{ sportNameFa }}</span>
      </nav>
      <h1 class="text-xl font-bold text-brand-navy min-[431px]:text-2xl">
        {{ h1 }}
      </h1>
      <p class="max-w-2xl text-sm leading-relaxed text-brand-gray-500">
        {{ description }}
      </p>
    </header>

  <SkillAssessmentFunnel
    :sport-slug="sportSlug"
    :sport-name-fa="sportNameFa"
    :sport-id="sportId"
  />

    <SkillAssessmentLevelGuide />

    <section class="space-y-3">
      <h2 class="text-base font-bold text-brand-navy">
        سایر ورزش‌ها
      </h2>
      <ul class="flex flex-wrap gap-2">
        <li v-for="slug in otherSports" :key="slug">
          <NuxtLink
            :to="localePath(`/skill-assessment/${slug}`)"
            prefetch
            class="inline-block border border-brand-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-brand-navy transition-transform hover:border-brand-primary active:scale-[0.99]"
            @pointerenter="warmSportRoute(slug)"
            @touchstart.passive="warmSportRoute(slug)"
          >
            {{ publicSkillNameFa(slug) }}
          </NuxtLink>
        </li>
      </ul>
    </section>

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