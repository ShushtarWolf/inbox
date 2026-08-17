<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatNumber } = useFormatters()

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
const { data: catalogClubs } = await useFetch('/api/clubs', { key: 'clubs-catalog' })

const listedSports = computed(() => {
  const set = new Set<string>()
  for (const club of catalogClubs.value || []) {
    for (const s of club.sports || []) set.add(s)
  }
  return set
})

const sportChips = computed(() => {
  const chips = [{ value: '', label: t('clubs.sportAll') }]
  if (listedSports.value.has('tennis')) chips.push({ value: 'tennis', label: t('clubs.sportTennis') })
  if (listedSports.value.has('padel')) chips.push({ value: 'padel', label: t('clubs.sportPadel') })
  return chips
})

const listTitle = computed(() => {
  if (sportFilter.value === 'tennis') return t('clubs.tennisCourtsTitle')
  if (sportFilter.value === 'padel') return t('clubs.padelCourtsTitle')
  return t('clubs.title')
})

/* Canva Court list (p2) hero matches home slide copy, including placeholder title */
const heroSlides = computed(() => {
  const slides = [
    {
      title: t('home.heroSlideTitle'),
      body: t('home.heroBody'),
      image: '/hero/tennis-court.jpg',
    },
    {
      title: t('home.bookCourt'),
      body: t('home.bookCourtHint'),
      image: '/hero/tennis-court.jpg',
    },
  ]
  if (listedSports.value.has('padel')) {
    slides.push({
      title: t('home.padelTitle'),
      body: t('home.clubSectionBody'),
      image: '/hero/padel-court.jpg',
    })
  }
  return slides
})

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

function clubHref(slug: string) {
  const query: Record<string, string> = {}
  const dateQ = typeof route.query.date === 'string' ? route.query.date : ''
  if (dateQ) query.date = dateQ
  return localePath({ path: `/clubs/${slug}`, query })
}

function sportCourtLabel(club: { sports?: string[] }) {
  if (club.sports?.includes('tennis')) return t('clubs.sportCourtTennis')
  if (club.sports?.includes('padel')) return t('clubs.sportCourtPadel')
  const sportSlug = club.sports?.[0]
  const sportName = sports.value?.find((item) => item.slug === sportSlug)
  return sportName ? localizedField(sportName, 'nameFa', 'nameEn') : t('clubs.sportCourtGeneric')
}

function clubMeta(club: { city?: string; sports?: string[] }) {
  return `${club.city || 'تهران'} | ${sportCourtLabel(club)}`
}

function clubRating(club: { rating?: number | null; reviewCount?: number }) {
  if (!club.reviewCount) return ''
  return (club.rating ?? 0).toFixed(1)
}

/** Canva: «هزینه هر سانس: ۳۰۰ الی ۴۵۰ هزار تومان» */
function toThousand(value: number) {
  return formatNumber(Math.round(value / 1000))
}

function priceLine(club: { priceFrom?: number | null; priceTo?: number | null }) {
  if (club.priceFrom == null && club.priceTo == null) return ''
  if (club.priceFrom != null && club.priceTo != null && club.priceFrom !== club.priceTo) {
    return t('clubs.sessionPriceRange', {
      from: toThousand(club.priceFrom),
      to: toThousand(club.priceTo),
    })
  }
  return t('clubs.sessionPriceFrom', { price: toThousand(club.priceFrom ?? club.priceTo ?? 0) })
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

const { onPointerDown: onHeroPointerDown, onPointerUp: onHeroPointerUp } = useSwipePager(
  heroSlide,
  () => heroSlides.value.length,
)
</script>

<template>
  <div class="tail-page-stack animate-fade-in">
    <CanvaPublicChrome />

    <section class="canva-hero canva-hero-home" @pointerdown="onHeroPointerDown" @pointerup="onHeroPointerUp">
      <img
        :key="activeHero?.image"
        :src="activeHero?.image"
        alt=""
        class="canva-hero-media canva-hero-media-bw"
      />
      <div class="canva-hero-scrim" aria-hidden="true" />
      <div class="canva-hero-content canva-hero-home-content">
        <div class="space-y-2" :key="heroSlide">
          <h1 class="canva-hero-title">{{ activeHero?.title }}</h1>
          <p class="max-w-sm text-sm text-white/90">{{ activeHero?.body }}</p>
        </div>

        <div class="mt-5 flex items-center justify-between">
          <button
            type="button"
            class="canva-hero-arrow"
            :aria-label="t('calendar.prevMonth')"
            @click.stop.prevent="prevHero"
          >
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
              @click.stop.prevent="heroSlide = index"
            />
          </div>
          <button
            type="button"
            class="canva-hero-arrow"
            :aria-label="t('calendar.nextMonth')"
            @click.stop.prevent="nextHero"
          >
            <AppIcon name="chevron_left" size="md" />
          </button>
        </div>
      </div>
    </section>

    <!-- Rectangular short chips, right-grouped (justify-start in RTL) -->
    <div class="canva-clubs-chip-row">
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
      <!-- Title+subtitle RIGHT, «مرتب سازی» LEFT — not in chip row -->
      <div class="canva-clubs-section-head">
        <div class="canva-clubs-section-copy">
          <h2 class="canva-clubs-section-title">{{ listTitle }}</h2>
          <p class="canva-clubs-section-subtitle">{{ t('home.suggestionsBody') }}</p>
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
        <div class="canva-court-card-grid">
          <NuxtLink
            v-for="club in clubs"
            :key="club.id"
            :to="clubHref(club.slug)"
            class="canva-court-card"
          >
            <img :src="clubImage(club)" alt="" />
            <div class="canva-court-card-body">
              <!-- RTL: text first → right; CTA second → left -->
              <div class="canva-court-card-copy">
                <p class="canva-court-card-title">{{ localizedField(club, 'nameFa', 'nameEn') }}</p>
                <p class="canva-court-card-meta">
                  {{ clubMeta(club) }}
                  <template v-if="clubRating(club)">
                    <span class="text-white/50">|</span>
                    <span class="canva-court-card-rating !mt-0 inline-flex">
                      {{ clubRating(club) }}
                      <span class="canva-court-card-star" aria-hidden="true">★</span>
                    </span>
                  </template>
                </p>
                <p
                  v-if="localizedField(club, 'descriptionFa', 'descriptionEn')"
                  class="canva-court-card-desc"
                >
                  {{ localizedField(club, 'descriptionFa', 'descriptionEn') }}
                </p>
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
