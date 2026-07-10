<script setup lang="ts">
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency } = useFormatters()
const { user, fetch: fetchAuth, firstName } = useAuth()

const sport = ref<string | undefined>('padel')

const { data: sports } = await useFetch('/api/sports')
const { data: clubs } = await useFetch('/api/clubs', {
  query: computed(() => ({
    sport: sport.value,
  })),
})
const { data: coaches } = await useFetch('/api/coaches', {
  query: computed(() => ({
    sport: sport.value,
  })),
})

onMounted(() => {
  if (!user.value) fetchAuth()
})

const highlightedClubs = computed(() => clubs.value?.slice(0, 2) || [])
const highlightedCoaches = computed(() => coaches.value?.slice(0, 2) || [])
const firstNameOrGuest = computed(() => firstName.value || t('home.guestName'))
const selectedMapClubSlug = ref<string | null>(null)
const heroSportIcon = ref(`/icons/sports/${sport.value || 'padel'}.svg`)
watch(sport, (value) => {
  heroSportIcon.value = `/icons/sports/${value || 'padel'}.svg`
}, { immediate: true })
const roleShortcut = computed(() => {
  if (!user.value) return null
  if (user.value.role === 'ATHLETE') return { label: t('nav.bookings'), to: localePath('/athlete/bookings') }
  if (user.value.role === 'COACH') return { label: t('coach.today'), to: localePath('/coach') }
  if (user.value.role === 'CLUB_ADMIN') return { label: t('owner.calendar'), to: localePath('/owner') }
  return null
})

const bookingsTileLink = computed(() => {
  if (!user.value) return localePath('/login')
  if (user.value.role === 'ATHLETE') return localePath('/athlete/bookings')
  if (user.value.role === 'COACH') return localePath('/coach')
  if (user.value.role === 'CLUB_ADMIN') return localePath('/owner')
  return localePath('/login')
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

function specialtyLabel(value: string) {
  return t(`coaches.specialtyOptions.${value}` as 'coaches.specialtyOptions.Padel basics')
}

function formatSpecialties(values?: string[]) {
  return values?.slice(0, 2).map(specialtyLabel).join(' · ') || t('home.coachSessionsLabel')
}

function bookingLink(path: '/clubs' | '/coaches') {
  return localePath({
    path,
    query: sport.value ? { sport: sport.value } : {},
  })
}

const mappableClubs = computed(() => {
  return (clubs.value || []).filter((club) => typeof club.lat === 'number' && typeof club.lng === 'number')
})

watch(mappableClubs, (clubsOnMap) => {
  if (!clubsOnMap.length) {
    selectedMapClubSlug.value = null
    return
  }

  if (!selectedMapClubSlug.value || !clubsOnMap.some((club) => club.slug === selectedMapClubSlug.value)) {
    selectedMapClubSlug.value = clubsOnMap[0]?.slug || null
  }
}, { immediate: true })

const selectedMapClub = computed(() => {
  return mappableClubs.value.find((club) => club.slug === selectedMapClubSlug.value) || mappableClubs.value[0] || null
})

const selectedMapEmbedUrl = computed(() => {
  if (!selectedMapClub.value) return null

  const lat = selectedMapClub.value.lat as number
  const lng = selectedMapClub.value.lng as number
  const latDelta = 0.018
  const lngDelta = 0.026
  const bbox = [
    (lng - lngDelta).toFixed(6),
    (lat - latDelta).toFixed(6),
    (lng + lngDelta).toFixed(6),
    (lat + latDelta).toFixed(6),
  ].join('%2C')

  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`
})

const positionedMapClubs = computed(() => {
  if (!selectedMapClub.value) return []

  const centerLat = selectedMapClub.value.lat as number
  const centerLng = selectedMapClub.value.lng as number
  const latDelta = 0.018
  const lngDelta = 0.026
  const minTop = 18
  const maxTop = 82
  const minLeft = 12
  const maxLeft = 88

  return mappableClubs.value.map((club) => {
    const lat = club.lat as number
    const lng = club.lng as number
    const topRatio = (centerLat + latDelta - lat) / (latDelta * 2)
    const leftRatio = (lng - (centerLng - lngDelta)) / (lngDelta * 2)
    const top = minTop + Math.min(Math.max(topRatio, 0), 1) * (maxTop - minTop)
    const left = minLeft + Math.min(Math.max(leftRatio, 0), 1) * (maxLeft - minLeft)

    return {
      ...club,
      top: `${top}%`,
      left: `${left}%`,
    }
  })
})

function handleHeroSportIconError() {
  if (heroSportIcon.value !== '/icons/sports/tennis.svg') {
    heroSportIcon.value = '/icons/sports/tennis.svg'
  }
}
</script>

<template>
  <div class="space-y-5 animate-fade-in venus-stagger">
    <section class="venus-hero-card">
      <p class="text-xs font-bold tracking-[0.2em] text-white/80" :class="locale === 'en' ? 'uppercase' : ''">{{ t('home.eyebrow') }}</p>
      <h1 class="mt-2 max-w-xs text-2xl font-bold leading-tight">
        {{ t('home.welcome', { name: firstNameOrGuest }) }}
      </h1>
      <p class="mt-2 max-w-sm text-sm text-white/85">{{ t('home.heroBody') }}</p>

      <div class="mt-5 grid gap-3 sm:grid-cols-2">
        <NuxtLink :to="bookingLink('/clubs')" class="venus-hero-action">
          <div class="venus-icon-wrap venus-icon-wrap-md bg-white/20 text-white">
            <img :src="heroSportIcon" alt="" class="h-6 w-6 brightness-0 invert" @error="handleHeroSportIconError" />
          </div>
          <p class="mt-4 text-base font-bold">{{ t('home.bookCourt') }}</p>
          <p class="mt-1 text-xs text-white/75">{{ t('home.bookCourtHint') }}</p>
        </NuxtLink>

        <NuxtLink :to="bookingLink('/coaches')" class="venus-hero-action">
          <div class="venus-icon-wrap venus-icon-wrap-md bg-white/20 text-white">
            <AppIcon name="person_search" size="md" />
          </div>
          <p class="mt-4 text-base font-bold">{{ t('home.findCoach') }}</p>
          <p class="mt-1 text-xs text-white/75">{{ t('home.findCoachHint') }}</p>
        </NuxtLink>
      </div>

      <NuxtLink :to="bookingLink('/clubs')" class="venus-search-bar mt-4 block text-brand-navy">
        <div class="flex items-center gap-3">
          <div class="venus-icon-wrap venus-icon-wrap-lg bg-brand-primary-soft text-brand-primary">
            <img :src="heroSportIcon" alt="" class="h-8 w-8" @error="handleHeroSportIconError" />
          </div>

          <div class="min-w-0 flex-1">
            <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-2 md:grid-cols-[minmax(0,1.55fr)_auto_minmax(0,1fr)]">
              <div class="min-w-0 px-2 py-1">
                <div class="flex items-center gap-2">
                  <AppIcon name="location_on" size="sm" class="text-brand-gray-600" />
                  <span class="truncate text-sm font-bold">{{ t('home.heroSearchWhere') }}</span>
                </div>
                <p class="mt-1 truncate text-sm text-brand-gray-600">{{ t('home.heroSearchWhereHint') }}</p>
              </div>

              <div class="hidden items-center justify-center md:flex">
                <div class="venus-icon-wrap venus-icon-wrap-md">
                  <AppIcon name="swap_horiz" size="sm" />
                </div>
              </div>

              <div class="min-w-0 border-l border-brand-gray-200 px-2 py-1">
                <div class="flex items-center gap-2">
                  <AppIcon name="calendar_month" size="sm" class="text-brand-gray-600" />
                  <span class="truncate text-sm font-bold">{{ t('home.heroSearchWhen') }}</span>
                </div>
                <p class="mt-1 truncate text-sm text-brand-gray-600">{{ heroSearchDate }}</p>
              </div>
            </div>
          </div>

          <div class="venus-icon-wrap venus-icon-wrap-lg bg-brand-primary text-white">
            <AppIcon name="search" size="lg" />
            <span class="sr-only">{{ t('home.searchWithFilters') }}</span>
          </div>
        </div>
      </NuxtLink>
    </section>

    <section class="space-y-3">
      <div>
        <h2 class="venus-section-title">{{ t('home.sportsTitle') }}</h2>
        <p class="venus-section-subtitle">{{ t('home.sportsSubtitle') }}</p>
      </div>

      <div class="flex gap-2 overflow-x-auto pb-1">
        <button
          v-for="s in sports"
          :key="s.slug"
          type="button"
          class="neo-pill shrink-0"
          :class="sport === s.slug ? 'neo-pill-active' : 'neo-pill-inactive'"
          @click="sport = s.slug"
        >
          {{ localizedField(s, 'nameFa', 'nameEn') }}
        </button>
      </div>
    </section>

    <section class="ios-card p-5">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="venus-section-title">{{ t('home.mapSectionTitle') }}</h2>
          <p class="venus-section-subtitle">{{ t('home.mapSectionBody') }}</p>
        </div>
        <NuxtLink :to="bookingLink('/clubs')" class="neo-badge">{{ t('home.seeAll') }}</NuxtLink>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(240px,0.9fr)]">
        <div class="overflow-hidden rounded-venus-lg border border-brand-gray-100 bg-brand-lavender shadow-venus-sm">
          <div class="relative min-h-[320px]">
            <iframe
              v-if="selectedMapEmbedUrl"
              :src="selectedMapEmbedUrl"
              class="absolute inset-0 h-full w-full border-0"
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"
              :title="t('home.mapSectionTitle')"
            />
            <div v-else class="flex h-[320px] items-center justify-center px-6 text-center text-sm font-bold text-brand-gray-600">
              {{ t('common.empty') }}
            </div>

            <div class="absolute inset-0">
              <button
                v-for="club in positionedMapClubs"
                :key="club.id"
                type="button"
                class="absolute -translate-x-1/2 -translate-y-1/2 transition-transform"
                :style="{ top: club.top, left: club.left }"
                @click="selectedMapClubSlug = club.slug"
              >
                <div
                  class="rounded-venus border px-3 py-2 text-start shadow-venus-sm transition-transform"
                  :class="selectedMapClubSlug === club.slug ? 'border-brand-primary bg-white scale-105' : 'border-brand-gray-200 bg-white'"
                >
                  <div class="flex items-center gap-2">
                    <span class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full" :class="selectedMapClubSlug === club.slug ? 'bg-brand-primary' : 'bg-brand-primary-soft'">
                      <span class="h-1.5 w-1.5 rounded-full bg-white" />
                    </span>
                    <span class="max-w-[9.5rem] truncate text-[11px] font-bold">{{ localizedField(club, 'nameFa', 'nameEn') }}</span>
                  </div>
                  <p class="mt-1 text-[11px] font-bold venus-price">
                    {{ formatCurrency(club.priceFrom) }}
                  </p>
                </div>
              </button>
            </div>
            <div class="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent" />
          </div>
        </div>

        <div v-if="selectedMapClub" class="venus-widget-card-accent">
          <p class="text-xs font-bold text-brand-primary">{{ t('home.mapSelectedLabel') }}</p>
          <h3 class="mt-2 text-lg font-bold text-brand-navy">{{ localizedField(selectedMapClub, 'nameFa', 'nameEn') }}</h3>
          <p class="mt-1 text-xs text-brand-gray-600">
            {{ selectedMapClub.city }}<span v-if="selectedMapClub.district"> · {{ selectedMapClub.district }}</span>
          </p>
          <p class="mt-3 text-sm venus-price">{{ formatCurrency(selectedMapClub.priceFrom) }}</p>
          <p class="mt-1 text-xs font-bold text-brand-gray-600">⭐ {{ selectedMapClub.rating }} · {{ selectedMapClub.reviewCount }} {{ t('clubs.reviews') }}</p>

          <div class="mt-4 flex gap-2">
            <NuxtLink :to="localePath(`/clubs/${selectedMapClub.slug}`)" class="btn-primary flex-1">
              {{ t('common.detail') }}
            </NuxtLink>
            <NuxtLink :to="localePath(`/book/court/${selectedMapClub.slug}`)" class="btn-ghost flex-1">
              {{ t('home.clubCta') }}
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>

    <section class="grid gap-3 sm:grid-cols-2">
      <div class="venus-widget-card">
        <div class="venus-icon-wrap venus-icon-wrap-sm">
          <AppIcon name="event_available" size="sm" />
        </div>
        <p class="mt-3 font-bold text-brand-navy">{{ t('home.bookingsTileTitle') }}</p>
        <p class="mt-1 text-xs text-brand-gray-600">{{ t('home.bookingsTileBody') }}</p>
        <NuxtLink :to="bookingsTileLink" class="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-primary">
          {{ t('home.bookingsTileAction') }}
          <AppIcon name="arrow_forward" size="sm" />
        </NuxtLink>
      </div>

      <div class="venus-widget-card">
        <div class="venus-icon-wrap venus-icon-wrap-sm">
          <AppIcon name="account_circle" size="sm" />
        </div>
        <p class="mt-3 font-bold text-brand-navy">{{ t('home.roleTileTitle') }}</p>
        <p class="mt-1 text-xs text-brand-gray-600">{{ user ? t('home.roleTileSignedIn') : t('home.roleTileGuest') }}</p>
        <NuxtLink :to="roleShortcut?.to || localePath('/login')" class="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-primary">
          {{ roleShortcut?.label || t('nav.login') }}
          <AppIcon name="arrow_forward" size="sm" />
        </NuxtLink>
      </div>
    </section>

    <section class="ios-card p-5">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="venus-section-title">{{ t('home.clubSectionTitle') }}</h2>
          <p class="venus-section-subtitle">{{ t('home.clubSectionBody') }}</p>
        </div>
        <NuxtLink :to="bookingLink('/clubs')" class="neo-badge">{{ t('home.seeAll') }}</NuxtLink>
      </div>

      <div class="mt-4 space-y-3">
        <NuxtLink
          v-for="club in highlightedClubs"
          :key="club.id"
          :to="localePath(`/clubs/${club.slug}`)"
          class="venus-list-item"
        >
          <img :src="club.image || '/demo/clubs/padel-zone-tehran.jpg'" alt="" class="h-14 w-14 venus-avatar rounded-venus" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-bold text-brand-navy">{{ localizedField(club, 'nameFa', 'nameEn') }}</p>
            <p class="mt-0.5 text-xs text-brand-gray-600">{{ club.city }} · ⭐ {{ club.rating }}</p>
            <p class="mt-1 text-xs venus-price">{{ formatCurrency(club.priceFrom) }}</p>
          </div>
          <span class="neo-badge">{{ t('home.clubCta') }}</span>
        </NuxtLink>
      </div>
    </section>

    <section class="ios-card p-5">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="venus-section-title">{{ t('home.coachSectionTitle') }}</h2>
          <p class="venus-section-subtitle">{{ t('home.coachSectionBody') }}</p>
        </div>
        <NuxtLink :to="bookingLink('/coaches')" class="neo-badge">{{ t('home.seeAll') }}</NuxtLink>
      </div>

      <div class="mt-4 space-y-3">
        <NuxtLink
          v-for="coach in highlightedCoaches"
          :key="coach.id"
          :to="localePath(`/coaches/${coach.id}`)"
          class="venus-list-item"
        >
          <img :src="coach.photo || '/demo/coaches/coach-1.jpg'" alt="" class="h-14 w-14 venus-avatar rounded-venus" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-bold text-brand-navy">{{ localizedField(coach, 'nameFa', 'nameEn') }}</p>
            <p class="mt-0.5 truncate text-xs text-brand-gray-600">{{ formatSpecialties(coach.specialties) }}</p>
            <p class="mt-1 text-xs venus-price">{{ formatCurrency(coach.sessionPrice) }}</p>
          </div>
          <span class="neo-badge">{{ t('home.coachCta') }}</span>
        </NuxtLink>
      </div>
    </section>

    <section class="grid gap-3 sm:grid-cols-3">
      <div class="venus-stat-card">
        <AppIcon name="bolt" size="sm" class="mx-auto text-brand-primary" />
        <p class="mt-2 text-sm font-bold text-brand-navy">{{ t('home.utilityFastTitle') }}</p>
        <p class="mt-1 text-xs text-brand-gray-600">{{ t('home.utilityFastBody') }}</p>
      </div>
      <div class="venus-stat-card">
        <AppIcon name="translate" size="sm" class="mx-auto text-brand-primary" />
        <p class="mt-2 text-sm font-bold text-brand-navy">{{ t('home.utilityLocaleTitle') }}</p>
        <p class="mt-1 text-xs text-brand-gray-600">{{ t('home.utilityLocaleBody') }}</p>
      </div>
      <div class="venus-stat-card">
        <AppIcon name="install_mobile" size="sm" class="mx-auto text-brand-primary" />
        <p class="mt-2 text-sm font-bold text-brand-navy">{{ t('home.utilityPwaTitle') }}</p>
        <p class="mt-1 text-xs text-brand-gray-600">{{ t('home.utilityPwaBody') }}</p>
      </div>
    </section>

    <PwaInstallBanner />
  </div>
</template>
