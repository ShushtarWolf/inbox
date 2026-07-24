<script setup lang="ts">
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { user, fetch: fetchAuth, firstName, dashboardPathForRole } = useAuth()
const { openGate } = useAuthFlow()

const sport = ref<string>('')
const heroSlide = ref(0)

const { data: sports, pending: sportsPending } = await useFetch('/api/sports')

/** Unfiltered clubs so Canva rails (suggestions / tennis / padel) stay populated. */
const { data: clubs, pending: clubsPending } = await useFetch('/api/clubs')

const pagePending = computed(() => sportsPending.value || clubsPending.value)

const firstNameOrGuest = computed(() => firstName.value || t('home.guestName'))
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

onMounted(() => {
  if (!user.value) fetchAuth()
})

const heroSearchDate = computed(() => {
  return new Intl.DateTimeFormat(locale.value === 'fa' ? 'fa-IR' : 'en-US', {
    calendar: locale.value === 'fa' ? 'persian' : 'gregory',
    numberingSystem: locale.value === 'fa' ? 'arabext' : undefined,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date())
})

function bookingLink(path: '/clubs', querySport?: string) {
  const sportQuery = querySport || sport.value || undefined
  return localePath({
    path,
    query: sportQuery ? { sport: sportQuery } : {},
  })
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
      <!-- Canva chrome: logo right, login left (RTL start/end) -->
      <header class="canva-home-chrome">
        <div class="flex items-center gap-2">
          <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7" />
          <span class="font-display text-lg font-bold tracking-wide text-brand-primary">INBOX</span>
        </div>
        <button
          v-if="!user"
          type="button"
          class="canva-home-login"
          @click="openGate()"
        >
          {{ t('auth.loginRegister') }}
        </button>
        <NuxtLink
          v-else
          :to="dashboardPathForRole(user.role)"
          class="canva-home-login canva-home-login-soft"
        >
          {{ t('home.welcome', { name: firstNameOrGuest }) }}
        </NuxtLink>
      </header>

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
        <div class="canva-search-field min-w-0">
          <p class="canva-search-label">{{ t('home.sportsTitle') }}</p>
          <select v-model="sport" class="canva-search-value w-full border-0 bg-transparent p-0 outline-none">
            <option value="">{{ t('home.sportsTitle') }}</option>
            <option v-for="s in sports" :key="s.slug" :value="s.slug">
              {{ localizedField(s, 'nameFa', 'nameEn') }}
            </option>
          </select>
        </div>
        <div class="canva-search-field min-w-0">
          <p class="canva-search-label">{{ t('home.heroSearchWhere') }}</p>
          <NuxtLink :to="bookingLink('/clubs')" class="canva-search-value block truncate">
            {{ t('home.heroSearchWhereHint') }}
          </NuxtLink>
        </div>
        <div class="canva-search-field min-w-0">
          <p class="canva-search-label">{{ t('home.heroSearchWhen') }}</p>
          <p class="canva-search-value truncate">{{ heroSearchDate }}</p>
        </div>
        <NuxtLink :to="bookingLink('/clubs')" class="canva-search-cta shrink-0 whitespace-nowrap">
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
            :to="localePath(`/book/court/${club.slug}`)"
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
            :to="localePath(`/book/court/${club.slug}`)"
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
            :to="localePath(`/book/court/${club.slug}`)"
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
