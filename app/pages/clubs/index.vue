<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency } = useFormatters()
const { openGate } = useAuthFlow()
const { user, dashboardPathForRole, firstName } = useAuth()

const sportFilter = ref<string>((route.query.sport as string) || '')
const sort = ref((route.query.sort as string) || 'rank')
const heroSlide = ref(0)

const query = computed(() => ({
  sport: sportFilter.value || undefined,
  sort: sort.value,
  city: route.query.city as string | undefined,
}))

const { data: clubs, pending, error } = await useFetch('/api/clubs', { query })
const { data: sports } = await useFetch('/api/sports')

const firstNameOrGuest = computed(() => firstName.value || t('home.guestName'))

const sportChips = computed(() => [
  { value: '', label: t('clubs.sportAll') },
  { value: 'tennis', label: t('clubs.sportTennis') },
  { value: 'padel', label: t('clubs.sportPadel') },
])

const listTitle = computed(() => {
  if (sportFilter.value === 'tennis') return t('clubs.tennisCourtsTitle')
  if (sportFilter.value === 'padel') return t('clubs.padelCourtsTitle')
  return t('clubs.courtsTitle')
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

async function setSport(value: string) {
  sportFilter.value = value
  await router.replace({
    query: {
      ...route.query,
      sport: value || undefined,
      sort: sort.value || undefined,
    },
  })
}

async function setSort(value: string) {
  sort.value = value
  await router.replace({
    query: {
      ...route.query,
      sport: sportFilter.value || undefined,
      sort: value || undefined,
    },
  })
}

function clubMeta(club: { city?: string; sports?: string[] }) {
  const sportSlug = club.sports?.[0]
  const sportName = sports.value?.find((item) => item.slug === sportSlug)
  const label = sportName ? localizedField(sportName, 'nameFa', 'nameEn') : t('home.sportsLabel')
  return `${club.city || 'تهران'} | ${label}`
}

function clubRating(club: { rating?: number | null }) {
  return (club.rating ?? 4.5).toFixed(1)
}

function priceLine(club: { priceFrom?: number | null; priceTo?: number | null }) {
  if (club.priceFrom == null && club.priceTo == null) return ''
  if (club.priceFrom != null && club.priceTo != null && club.priceFrom !== club.priceTo) {
    return t('clubs.sessionPriceRange', {
      from: formatCurrency(club.priceFrom),
      to: formatCurrency(club.priceTo),
    })
  }
  return t('clubs.sessionPriceFrom', { price: formatCurrency(club.priceFrom ?? club.priceTo ?? 0) })
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
  <div class="tail-page-stack animate-fade-in">
    <!-- Canva chrome: logo right, square login left -->
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

    <!-- Rectangular sport chips, right-grouped -->
    <div class="flex justify-end gap-2">
      <button
        v-for="chip in sportChips"
        :key="chip.value || 'all'"
        type="button"
        class="canva-clubs-chip"
        :class="sportFilter === chip.value ? 'canva-clubs-chip-active' : 'canva-clubs-chip-idle'"
        @click="setSport(chip.value)"
      >
        {{ chip.label }}
      </button>
    </div>

    <section class="space-y-3">
      <div class="flex items-end justify-between gap-3">
        <div>
          <h2 class="text-lg font-bold text-brand-primary">{{ listTitle }}</h2>
          <p class="text-xs text-brand-gray-600">{{ t('home.suggestionsBody') }}</p>
        </div>
        <label class="canva-clubs-sort">
          <span>{{ t('clubs.sortLabel') }}</span>
          <AppIcon name="sort" size="sm" />
          <select
            :value="sort"
            class="canva-clubs-sort-select"
            @change="setSort(($event.target as HTMLSelectElement).value)"
          >
            <option value="rank">{{ t('clubs.sort.rank') }}</option>
            <option value="rating">{{ t('clubs.sort.rating') }}</option>
            <option value="price">{{ t('clubs.sort.price') }}</option>
          </select>
        </label>
      </div>

      <AppAsyncState :pending="pending" :error="error" :empty="!clubs?.length" skeleton-variant="table">
        <div class="space-y-3">
          <NuxtLink
            v-for="club in clubs"
            :key="club.id"
            :to="localePath(`/book/court/${club.slug}`)"
            class="canva-court-card"
          >
            <img :src="clubImage(club)" alt="" />
            <div class="canva-court-card-body">
              <!-- RTL: text first → right; CTA second → left -->
              <div class="canva-court-card-copy">
                <p class="canva-court-card-title">{{ localizedField(club, 'nameFa', 'nameEn') }}</p>
                <p class="canva-court-card-rating">
                  <span class="canva-court-card-star" aria-hidden="true">★</span>
                  {{ clubRating(club) }}
                </p>
                <p class="canva-court-card-meta">{{ clubMeta(club) }}</p>
                <p v-if="priceLine(club)" class="canva-court-card-price">{{ priceLine(club) }}</p>
              </div>
              <span class="canva-court-card-cta">{{ t('home.bookNow') }}</span>
            </div>
          </NuxtLink>
        </div>
      </AppAsyncState>
    </section>
  </div>
</template>
