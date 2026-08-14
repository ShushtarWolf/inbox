<script setup lang="ts">
/** Canva p25: personalized athlete home inside phone shell (not public layout). */
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { firstName, displayName, user, fetch: fetchAuth } = useAuth()

const sport = ref('')
const city = ref('')
const date = ref('')
const showDatePicker = ref(false)

const { data: sports, pending: sportsPending } = await useFetch('/api/sports')

const { data: clubs, pending: clubsPending } = await useFetch('/api/clubs')

const pagePending = computed(() => sportsPending.value || clubsPending.value)
const greetName = computed(() => firstName.value || displayName.value || t('home.guestName'))
const { formatDayNumber, formatMonth, formatWeekday } = useFormatters()

const cityOptions = computed(() => {
  const set = new Set<string>()
  for (const club of clubs.value || []) {
    if (club.city) set.add(club.city)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'fa'))
})

const dateFieldLabel = computed(() => {
  if (!date.value) return t('home.heroSearchDateHint')
  return `${formatWeekday(date.value)} ${formatDayNumber(date.value)} ${formatMonth(date.value)}`
})

const suggestedClubs = computed(() => clubs.value?.slice(0, 3) || [])
const tennisClubs = computed(() => {
  const list = clubs.value || []
  return list.filter((club: { sports?: string[] }) => club.sports?.includes('tennis')).slice(0, 3)
})
const padelClubs = computed(() => {
  const list = clubs.value || []
  return list.filter((club: { sports?: string[] }) => club.sports?.includes('padel')).slice(0, 3)
})

function bookingLink(path: '/clubs', querySport?: string) {
  const sportQuery = querySport || sport.value || undefined
  const cityQuery = city.value || undefined
  const dateQuery = date.value || undefined
  const query: Record<string, string> = {}
  if (sportQuery) query.sport = sportQuery
  if (cityQuery) query.city = cityQuery
  if (dateQuery) query.date = dateQuery
  return localePath({ path, query })
}

function clubHref(slug: string) {
  const query: Record<string, string> = {}
  if (date.value) query.date = date.value
  return localePath({ path: `/clubs/${slug}`, query })
}

function onHomeDatePicked() {
  showDatePicker.value = false
}

function clubMeta(club: { city?: string; rating?: number | null; reviewCount?: number; sports?: string[] }) {
  const sportSlug = club.sports?.[0]
  const sportName = sports.value?.find((item) => item.slug === sportSlug)
  const label = sportName ? localizedField(sportName, 'nameFa', 'nameEn') : t('home.sportsLabel')
  const rating = club.reviewCount && club.rating != null ? ` | ${club.rating.toFixed(1)} ★` : ''
  return `${club.city || 'تهران'} | ${label}${rating}`
}

function clubImage(club: { image?: string | null; sports?: string[] }) {
  if (club.image) return club.image
  if (club.sports?.includes('padel')) return '/hero/padel-court.jpg'
  if (club.sports?.includes('tennis')) return '/hero/tennis-court.jpg'
  return '/hero/fitness-venue.jpg'
}

onMounted(() => {
  if (!user.value) fetchAuth()
})
</script>

<template>
  <div class="venus-page-stack">
    <section class="canva-photo-hero canva-photo-hero-curve -mx-4 sm:-mx-0">
      <img src="/hero/fitness-venue.jpg" alt="" class="canva-photo-hero-media" style="filter: grayscale(0.55) brightness(0.72);" />
      <div class="canva-photo-hero-wash" />
      <div class="canva-photo-hero-top">
        <InboxWordmark home-link class="text-base text-white" />
        <div class="flex items-center gap-3 text-white">
          <NuxtLink :to="localePath('/athlete/notifications')" :aria-label="t('athlete.notifications')">
            <AppIcon name="notifications" size="sm" />
          </NuxtLink>
          <NuxtLink :to="localePath('/athlete')" :aria-label="t('nav.profile')">
            <AppIcon name="person" size="sm" />
          </NuxtLink>
        </div>
      </div>
      <div class="canva-promo-badge pointer-events-none" :title="t('athlete.homePromoCodeHint')" aria-hidden="true">
        <span class="canva-promo-badge-pct">۲۰٪</span>
        <span class="canva-promo-badge-label">{{ t('athlete.homePromoShort') }}</span>
      </div>
      <div class="canva-photo-hero-body !min-h-[10.5rem]">
        <h1 class="canva-page-hero-title text-2xl">{{ t('athlete.homeGreeting', { name: greetName }) }}</h1>
        <p class="mt-1 text-sm text-white/85">{{ t('athlete.homePickCourt') }}</p>
      </div>
    </section>

    <AppAsyncState :pending="pagePending" skeleton-variant="stat-grid">
      <section class="canva-search-row">
        <div class="canva-search-fields">
          <div class="canva-search-field">
            <label class="sr-only" for="athlete-home-sport-select">{{ t('home.sportsTitle') }}</label>
            <select
              id="athlete-home-sport-select"
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
            <label class="sr-only" for="athlete-home-city-select">{{ t('home.heroSearchWhere') }}</label>
            <select
              id="athlete-home-city-select"
              v-model="city"
              class="canva-search-placeholder"
              :class="{ 'canva-search-placeholder-filled': city }"
            >
              <option value="">{{ t('home.heroSearchWhereHint') }}</option>
              <option v-for="c in cityOptions" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div class="canva-search-field">
            <label class="sr-only" for="athlete-home-date-btn">{{ t('home.heroSearchDate') }}</label>
            <button
              id="athlete-home-date-btn"
              type="button"
              class="canva-search-placeholder w-full text-center"
              :class="{ 'canva-search-placeholder-filled': date }"
              @click="showDatePicker = true"
            >
              {{ dateFieldLabel }}
            </button>
          </div>
        </div>
        <NuxtLink :to="bookingLink('/clubs')" class="canva-search-cta">
          {{ t('home.searchWithFilters') }}
        </NuxtLink>
      </section>

      <AppModal
        :open="showDatePicker"
        sheet
        patterned
        :title="t('home.heroSearchDateHint')"
        max-width-class="canva-phone-shell max-w-sm"
        @close="showDatePicker = false"
      >
        <div class="px-4 pb-5 pt-2">
          <AppJalaliCalendar v-model="date" @select="onHomeDatePicked" />
        </div>
      </AppModal>

      <section class="space-y-3">
        <div class="flex items-end justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold text-brand-primary">{{ t('home.suggestionsTitle') }}</h2>
            <p class="text-xs text-brand-gray-600">{{ t('home.suggestionsBody') }}</p>
          </div>
          <NuxtLink :to="bookingLink('/clubs')" class="text-xs font-bold text-brand-navy">{{ t('home.seeAll') }}</NuxtLink>
        </div>
        <div v-if="suggestedClubs.length" class="canva-venue-grid">
          <NuxtLink
            v-for="club in suggestedClubs"
            :key="club.id"
            :to="clubHref(club.slug)"
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
          <NuxtLink :to="bookingLink('/clubs', 'tennis')" class="text-xs font-bold text-brand-navy">{{ t('home.seeAll') }}</NuxtLink>
        </div>
        <div v-if="tennisClubs.length" class="canva-venue-grid">
          <NuxtLink
            v-for="club in tennisClubs"
            :key="`tennis-${club.id}`"
            :to="clubHref(club.slug)"
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
          <NuxtLink :to="bookingLink('/clubs', 'padel')" class="text-xs font-bold text-brand-navy">{{ t('home.seeAll') }}</NuxtLink>
        </div>
        <div v-if="padelClubs.length" class="canva-venue-grid">
          <NuxtLink
            v-for="club in padelClubs"
            :key="`padel-${club.id}`"
            :to="clubHref(club.slug)"
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
    </AppAsyncState>
  </div>
</template>
