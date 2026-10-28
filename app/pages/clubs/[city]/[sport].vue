<script setup lang="ts">
import { findGeoSportHub, siblingGeoSportHub } from '#shared/geoSportHubs.ts'

const route = useRoute()
const { t } = useI18n()
const config = useRuntimeConfig()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()

const cityParam = String(route.params.city || '')
const sportParam = String(route.params.sport || '')
const hub = findGeoSportHub(cityParam, sportParam)

if (!hub) {
  throw createError({ statusCode: 404, statusMessage: 'Hub not found' })
}

const sibling = siblingGeoSportHub(hub)
const i18nPrefix = `clubs.hubs.${hub.i18nKey}` as const

const { data: clubs, pending, error } = await useFetch('/api/clubs', {
  query: {
    city: hub.apiCity,
    sport: hub.sportSlug,
    sort: 'rank',
  },
  key: `geo-hub-${hub.citySlug}-${hub.sportSlug}`,
})

const seoTitle = computed(() => t(`${i18nPrefix}.seoTitle`))
const seoDescription = computed(() => t(`${i18nPrefix}.seoDescription`))
const siteBase = computed(() => String(config.public.siteUrl || '').replace(/\/$/, '') || 'https://inboxs.ir')
const canonicalUrl = computed(() => `${siteBase.value}${hub.path}`)
const ogImageUrl = computed(() => `${siteBase.value}${hub.heroImage}`)

useSeoMeta({
  title: () => seoTitle.value,
  description: () => seoDescription.value,
  ogTitle: () => seoTitle.value,
  ogDescription: () => seoDescription.value,
  ogUrl: () => canonicalUrl.value,
  ogImage: () => ogImageUrl.value,
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterImage: () => ogImageUrl.value,
})

useHead(() => ({
  link: [{ rel: 'canonical', href: canonicalUrl.value }],
}))

function clubHref(slug: string) {
  return localePath(`/clubs/${slug}`)
}

function sportCourtLabel(club: { sports?: string[] }) {
  if (club.sports?.includes('tennis')) return t('clubs.sportCourtTennis')
  if (club.sports?.includes('padel')) return t('clubs.sportCourtPadel')
  return t('clubs.sportCourtGeneric')
}

function clubMeta(club: { city?: string; sports?: string[] }) {
  return `${club.city || hub.apiCity} | ${sportCourtLabel(club)}`
}

function clubRating(club: { rating?: number | null; reviewCount?: number }) {
  if (!club.reviewCount) return ''
  return (club.rating ?? 0).toFixed(1)
}

function clubImage(club: { image?: string | null; sports?: string[] }) {
  if (club.image) return club.image
  if (club.sports?.includes('padel')) return '/hero/padel-court.jpg'
  if (club.sports?.includes('tennis')) return '/hero/tennis-court.jpg'
  return hub.heroImage
}

function clubImageAlt(club: { nameFa?: string; nameEn?: string }) {
  return t('home.clubImageAlt', { name: localizedField(club, 'nameFa', 'nameEn') })
}
</script>

<template>
  <div class="tail-page-stack animate-fade-in">
    <CanvaPublicChrome />

    <section class="canva-hero canva-hero-home">
      <CanvaHeroImg
        :src="hub.heroImage"
        :alt="t('home.heroImageAlt', { title: t(`${i18nPrefix}.h1`) })"
        img-class="canva-hero-media canva-hero-media-bw"
        fetchpriority="high"
      />
      <div class="canva-hero-scrim pointer-events-none" aria-hidden="true" />
      <div class="canva-hero-content canva-hero-home-content">
        <div class="space-y-2">
          <h1 class="canva-hero-title text-white">{{ t(`${i18nPrefix}.h1`) }}</h1>
          <p class="max-w-sm text-start text-sm text-white/90">{{ t(`${i18nPrefix}.intro`) }}</p>
        </div>
      </div>
    </section>

    <section class="space-y-3">
      <div class="canva-clubs-section-head">
        <div class="canva-clubs-section-copy">
          <h2 class="canva-clubs-section-title">{{ t(`${i18nPrefix}.listTitle`) }}</h2>
          <p class="canva-clubs-section-subtitle">{{ t('home.suggestionsBody') }}</p>
        </div>
        <NuxtLink :to="localePath('/clubs')" class="inline-flex items-center gap-0.5 text-xs font-medium text-brand-gray-600">
          {{ t('home.seeAll') }}
          <AppIcon name="chevron_left" size="sm" />
        </NuxtLink>
      </div>

      <AppAsyncState :pending="pending" :error="error" :empty="!clubs?.length" skeleton-variant="table">
        <div class="canva-venue-grid">
          <NuxtLink
            v-for="club in clubs"
            :key="club.id"
            :to="clubHref(club.slug)"
            class="canva-venue-card"
          >
            <CanvaHeroImg :src="clubImage(club)" :alt="clubImageAlt(club)" loading="lazy" />
            <div class="canva-venue-card-body">
              <div class="canva-venue-card-copy">
                <p class="canva-venue-card-title">{{ localizedField(club, 'nameFa', 'nameEn') }}</p>
                <p class="canva-venue-card-meta">
                  <template v-if="clubRating(club)">★ {{ clubRating(club) }} | </template>{{ clubMeta(club) }}
                </p>
              </div>
              <span class="canva-venue-card-cta">{{ t('home.bookNow') }}</span>
            </div>
          </NuxtLink>
        </div>
      </AppAsyncState>
    </section>

    <nav class="space-y-2 border border-brand-gray-200 bg-white p-3" style="border-radius: var(--sz-canva-radius);" :aria-label="t('clubs.hubs.relatedLabel')">
      <p class="text-start text-xs font-bold text-brand-gray-600">{{ t('clubs.hubs.relatedLabel') }}</p>
      <div class="flex flex-col gap-2">
        <NuxtLink
          v-if="sibling"
          :to="localePath(sibling.path)"
          class="text-start text-sm font-bold text-brand-navy underline-offset-2 hover:underline"
        >
          {{ t(`${i18nPrefix}.siblingLink`) }}
        </NuxtLink>
        <NuxtLink
          :to="localePath('/clubs')"
          class="text-start text-sm font-bold text-brand-navy underline-offset-2 hover:underline"
        >
          {{ t('clubs.hubs.allClubs') }}
        </NuxtLink>
      </div>
    </nav>

    <LegalFaq faq-key="legal.sitewideFaq" :page-url-path="hub.path" />
  </div>
</template>
