<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()

const sport = ref<string>('')
const city = ref<string>('')
const heroSlide = ref(0)

const { data: sports, pending: sportsPending } = await useFetch('/api/sports')

/** Unfiltered clubs so Canva rails (suggestions / tennis / padel) stay populated. */
const { data: clubs, pending: clubsPending } = await useFetch('/api/clubs')

const pagePending = computed(() => sportsPending.value || clubsPending.value)

const cityOptions = computed(() => {
  const set = new Set<string>()
  for (const club of clubs.value || []) {
    if (club.city) set.add(club.city)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'fa'))
})

/** Canva home frames show three square tiles per rail. */
const suggestedClubs = computed(() => clubs.value?.slice(0, 3) || [])
const tennisClubs = computed(() => {
  const list = clubs.value || []
  return list.filter((club) => club.sports?.includes('tennis')).slice(0, 3)
})
const padelClubs = computed(() => {
  const list = clubs.value || []
  return list.filter((club) => club.sports?.includes('padel')).slice(0, 3)
})

const heroSlides = computed(() => [
  {
    title: t('home.heroSlideTitle'),
    body: t('home.heroBody'),
    image: '/hero/tennis-court.jpg',
  },
  {
    title: t('home.bookCourt'),
    body: t('home.bookCourtHint'),
    image: '/hero/padel-court.jpg',
  },
  {
    title: t('home.padelTitle'),
    body: t('home.clubSectionBody'),
    image: '/hero/fitness-venue.jpg',
  },
])

const activeHero = computed(() => heroSlides.value[heroSlide.value] || heroSlides.value[0])

function bookingLink(path: '/clubs', querySport?: string) {
  const sportQuery = querySport || sport.value || undefined
  const cityQuery = city.value || undefined
  const query: Record<string, string> = {}
  if (sportQuery) query.sport = sportQuery
  if (cityQuery) query.city = cityQuery
  return localePath({ path, query })
}

function clubMeta(club: { city?: string; rating?: number | null; sports?: string[] }) {
  const sportSlug = club.sports?.[0]
  const sportName = sports.value?.find((item) => item.slug === sportSlug)
  const label = sportName ? localizedField(sportName, 'nameFa', 'nameEn') : t('home.sportsLabel')
  const rating = club.rating != null ? club.rating.toFixed(1) : '4.5'
  return `${club.city || 'تهران'} | ${label} | ${rating} ★`
}

function clubImage(club: { image?: string | null; sports?: string[] }) {
  if (club.image) return club.image
  if (club.sports?.includes('padel')) return '/hero/padel-court.jpg'
  if (club.sports?.includes('tennis')) return '/hero/tennis-court.jpg'
  return '/hero/fitness-venue.jpg'
}

function nextHero() {
  heroSlide.value = (heroSlide.value + 1) % heroSlides.value.length
}

function prevHero() {
  heroSlide.value = (heroSlide.value - 1 + heroSlides.value.length) % heroSlides.value.length
}
</script>

<template>
  <AppAsyncState :pending="pagePending" skeleton-variant="stat-grid">
    <div class="tail-page-stack animate-fade-in tail-stagger">
      <CanvaPublicChrome />

      <section class="canva-hero canva-hero-home">
        <img
          :src="activeHero?.image"
          alt=""
          class="canva-hero-media canva-hero-media-bw"
        />
        <div class="canva-hero-scrim" aria-hidden="true" />
        <div class="canva-hero-content canva-hero-home-content">
          <div class="space-y-2">
            <h1 class="canva-hero-title">{{ activeHero?.title }}</h1>
            <p class="max-w-sm text-sm text-white/90">{{ activeHero?.body }}</p>
          </div>

          <div class="mt-5 flex items-center justify-between">
            <button type="button" class="canva-hero-arrow" :aria-label="t('calendar.prevMonth')" @click="prevHero">
              <AppIcon name="chevron_right" size="md" />
            </button>
            <div class="flex gap-2">
              <button
                v-for="(_, index) in heroSlides"
                :key="index"
                type="button"
                class="canva-hero-dot"
                :class="index === heroSlide ? 'canva-hero-dot-active' : 'canva-hero-dot-idle'"
                :aria-label="t('common.carouselSlide', { current: index + 1, total: heroSlides.length })"
                :aria-current="index === heroSlide ? 'true' : undefined"
                @click="heroSlide = index"
              />
            </div>
            <button type="button" class="canva-hero-arrow" :aria-label="t('calendar.nextMonth')" @click="nextHero">
              <AppIcon name="chevron_left" size="md" />
            </button>
          </div>
        </div>
      </section>

      <section class="canva-search-row">
        <div class="canva-search-fields canva-search-fields-2">
          <div class="canva-search-field">
            <label class="sr-only" for="home-sport-select">{{ t('home.sportsTitle') }}</label>
            <select
              id="home-sport-select"
              v-model="sport"
              class="canva-search-placeholder"
              :class="{ 'canva-search-placeholder-filled': sport }"
            >
              <option value="">{{ t('home.sportsTitle') }}</option>
              <option v-for="s in sports" :key="s.slug" :value="s.slug">
                {{ localizedField(s, 'nameFa', 'nameEn') }}
              </option>
            </select>
          </div>
          <div class="canva-search-field canva-search-field-wide">
            <label class="sr-only" for="home-city-select">{{ t('home.heroSearchWhere') }}</label>
            <select
              id="home-city-select"
              v-model="city"
              class="canva-search-placeholder"
              :class="{ 'canva-search-placeholder-filled': city }"
            >
              <option value="">{{ t('home.heroSearchWhereHint') }}</option>
              <option v-for="c in cityOptions" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
        </div>
        <NuxtLink :to="bookingLink('/clubs')" class="canva-search-cta">
          {{ t('home.searchWithFilters') }}
        </NuxtLink>
      </section>

      <section class="space-y-3">
        <div class="flex items-end justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold text-brand-primary">{{ t('home.suggestionsTitle') }}</h2>
            <p class="text-xs text-brand-gray-600">{{ t('home.suggestionsBody') }}</p>
          </div>
          <NuxtLink :to="bookingLink('/clubs')" class="inline-flex items-center gap-0.5 text-xs font-medium text-brand-gray-600">
            {{ t('home.seeAll') }}
            <AppIcon name="chevron_left" size="sm" />
          </NuxtLink>
        </div>
        <div v-if="suggestedClubs.length" class="canva-venue-grid">
          <NuxtLink
            v-for="club in suggestedClubs"
            :key="club.id"
            :to="localePath(`/clubs/${club.slug}`)"
            class="canva-venue-card"
          >
            <img :src="clubImage(club)" alt="" />
            <div class="canva-venue-card-body">
              <div class="canva-venue-card-copy">
                <p class="canva-venue-card-title">{{ localizedField(club, 'nameFa', 'nameEn') }}</p>
                <p class="canva-venue-card-meta">{{ clubMeta(club) }}</p>
              </div>
              <span class="canva-venue-card-cta">{{ t('home.bookNow') }}</span>
            </div>
          </NuxtLink>
        </div>
        <p v-else class="text-sm text-brand-gray-600">{{ t('common.empty') }}</p>
      </section>

      <section class="space-y-3">
        <div class="flex items-end justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold text-brand-primary">{{ t('home.tennisTitle') }}</h2>
            <p class="text-xs text-brand-gray-600">{{ t('home.clubSectionBody') }}</p>
          </div>
          <NuxtLink :to="bookingLink('/clubs', 'tennis')" class="inline-flex items-center gap-0.5 text-xs font-medium text-brand-gray-600">
            {{ t('home.seeAll') }}
            <AppIcon name="chevron_left" size="sm" />
          </NuxtLink>
        </div>
        <div v-if="tennisClubs.length" class="canva-venue-grid">
          <NuxtLink
            v-for="club in tennisClubs"
            :key="`tennis-${club.id}`"
            :to="localePath(`/clubs/${club.slug}`)"
            class="canva-venue-card"
          >
            <img :src="clubImage(club)" alt="" />
            <div class="canva-venue-card-body">
              <div class="canva-venue-card-copy">
                <p class="canva-venue-card-title">{{ localizedField(club, 'nameFa', 'nameEn') }}</p>
                <p class="canva-venue-card-meta">{{ clubMeta(club) }}</p>
              </div>
              <span class="canva-venue-card-cta">{{ t('home.bookNow') }}</span>
            </div>
          </NuxtLink>
        </div>
        <p v-else class="text-sm text-brand-gray-600">{{ t('common.empty') }}</p>
      </section>

      <section class="space-y-3">
        <div class="flex items-end justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold text-brand-primary">{{ t('home.padelTitle') }}</h2>
            <p class="text-xs text-brand-gray-600">{{ t('home.clubSectionBody') }}</p>
          </div>
          <NuxtLink :to="bookingLink('/clubs', 'padel')" class="inline-flex items-center gap-0.5 text-xs font-medium text-brand-gray-600">
            {{ t('home.seeAll') }}
            <AppIcon name="chevron_left" size="sm" />
          </NuxtLink>
        </div>
        <div v-if="padelClubs.length" class="canva-venue-grid">
          <NuxtLink
            v-for="club in padelClubs"
            :key="`padel-${club.id}`"
            :to="localePath(`/clubs/${club.slug}`)"
            class="canva-venue-card"
          >
            <img :src="clubImage(club)" alt="" />
            <div class="canva-venue-card-body">
              <div class="canva-venue-card-copy">
                <p class="canva-venue-card-title">{{ localizedField(club, 'nameFa', 'nameEn') }}</p>
                <p class="canva-venue-card-meta">{{ clubMeta(club) }}</p>
              </div>
              <span class="canva-venue-card-cta">{{ t('home.bookNow') }}</span>
            </div>
          </NuxtLink>
        </div>
        <p v-else class="text-sm text-brand-gray-600">{{ t('common.empty') }}</p>
      </section>
    </div>
  </AppAsyncState>
</template>
