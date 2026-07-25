<script setup lang="ts">
/** Canva p25: personalized athlete home inside phone shell (not public layout). */
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { firstName, displayName, user, fetch: fetchAuth } = useAuth()

const sport = ref('')

const { data: sports, pending: sportsPending } = await useFetch('/api/sports')

const { data: clubs, pending: clubsPending } = await useFetch('/api/clubs')

const pagePending = computed(() => sportsPending.value || clubsPending.value)
const greetName = computed(() => firstName.value || displayName.value || t('home.guestName'))

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
  return localePath({
    path,
    query: (querySport || sport.value) ? { sport: querySport || sport.value } : {},
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
        <span class="font-display text-base font-bold tracking-wide text-white">INBOX</span>
        <NuxtLink :to="localePath('/athlete')" class="text-white" :aria-label="t('nav.profile')">
          <AppIcon name="person" size="sm" />
        </NuxtLink>
      </div>
      <div class="canva-promo-badge">
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
        <NuxtLink :to="bookingLink('/clubs')" class="canva-search-cta-icon" :aria-label="t('home.searchWithFilters')">
          <AppIcon name="search" size="sm" />
        </NuxtLink>
        <div class="canva-search-fields">
          <div class="canva-search-field">
            <select
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
            <NuxtLink :to="bookingLink('/clubs')" class="canva-search-placeholder block truncate">
              {{ t('home.heroSearchWhereHint') }}
            </NuxtLink>
          </div>
          <div class="canva-search-field">
            <NuxtLink :to="bookingLink('/clubs')" class="canva-search-placeholder block truncate">
              {{ t('home.heroSearchWhen') }}
            </NuxtLink>
          </div>
        </div>
      </section>

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
          <NuxtLink :to="bookingLink('/clubs', 'tennis')" class="text-xs font-bold text-brand-navy">{{ t('home.seeAll') }}</NuxtLink>
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
          <NuxtLink :to="bookingLink('/clubs', 'padel')" class="text-xs font-bold text-brand-navy">{{ t('home.seeAll') }}</NuxtLink>
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
    </AppAsyncState>
  </div>
</template>
