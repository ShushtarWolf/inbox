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
  <div class="space-y-4 animate-fade-in venus-stagger">
    <section class="ios-card overflow-hidden border-2 border-black bg-brand-lavender p-4 text-black shadow-brutal-lg">
      <div>
        <div>
          <p class="text-xs font-black tracking-[0.2em] text-black/70" :class="locale === 'en' ? 'uppercase' : ''">{{ t('home.eyebrow') }}</p>
          <h1 class="mt-2 max-w-xs text-2xl font-black leading-tight">
            {{ t('home.welcome', { name: firstNameOrGuest }) }}
          </h1>
          <p class="mt-2 max-w-sm text-sm font-bold text-black/80">{{ t('home.heroBody') }}</p>
        </div>
      </div>

      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <NuxtLink :to="bookingLink('/clubs')" class="rounded-brutal border-2 border-black bg-brand-accent p-4 shadow-brutal transition hover:-translate-y-0.5 hover:shadow-brutal-lg">
          <div class="flex h-11 w-11 items-center justify-center border-2 border-black bg-white shadow-brutal-sm">
            <img :src="heroSportIcon" alt="" class="h-6 w-6" @error="handleHeroSportIconError" />
          </div>
          <p class="mt-4 text-base font-black">{{ t('home.bookCourt') }}</p>
          <p class="mt-1 text-xs font-bold text-black/75">{{ t('home.bookCourtHint') }}</p>
        </NuxtLink>

        <NuxtLink :to="bookingLink('/coaches')" class="rounded-brutal border-2 border-black bg-brand-sky p-4 shadow-brutal transition hover:-translate-y-0.5 hover:shadow-brutal-lg">
          <div class="flex h-11 w-11 items-center justify-center border-2 border-black bg-white text-lg shadow-brutal-sm">◌</div>
          <p class="mt-4 text-base font-black">{{ t('home.findCoach') }}</p>
          <p class="mt-1 text-xs font-bold text-black/75">{{ t('home.findCoachHint') }}</p>
        </NuxtLink>
      </div>

      <NuxtLink
        :to="bookingLink('/clubs')"
        class="mt-4 block rounded-brutal border-2 border-black bg-white p-2 text-black shadow-brutal transition hover:-translate-y-0.5 hover:shadow-brutal-lg"
      >
        <div class="flex items-center gap-2">
          <div class="flex h-[4.25rem] w-[4.25rem] shrink-0 items-center justify-center border-2 border-black bg-brand-mint shadow-brutal-sm">
            <img :src="heroSportIcon" alt="" class="h-10 w-10" @error="handleHeroSportIconError" />
          </div>

          <div class="min-w-0 flex-1">
            <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-2 md:grid-cols-[minmax(0,1.55fr)_auto_minmax(0,1fr)]">
              <div class="min-w-0 rounded-brutal px-3 py-2.5">
                <div class="flex items-center gap-2 text-black">
                  <svg class="h-4 w-4 shrink-0 text-black/60" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 21s6-4.35 6-10a6 6 0 1 0-12 0c0 5.65 6 10 6 10Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                    <circle cx="12" cy="11" r="2.2" stroke="currentColor" stroke-width="1.8" />
                  </svg>
                  <span class="truncate text-sm font-black">{{ t('home.heroSearchWhere') }}</span>
                </div>
                <p class="mt-1 truncate text-sm font-bold text-black/60">{{ t('home.heroSearchWhereHint') }}</p>
              </div>

              <div class="hidden items-center justify-center md:flex">
                <div class="flex h-11 w-11 items-center justify-center rounded-brutal border-2 border-black bg-brand-accent text-black shadow-brutal-sm">
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="m5 12 14-7-4.5 14-2.8-5-6.7-2Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </div>
              </div>

              <div class="min-w-0 border-l-2 border-black px-3 py-2.5">
                <div class="flex items-center gap-2 text-black">
                  <svg class="h-4 w-4 shrink-0 text-black/60" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3.75" y="5.25" width="16.5" height="15" rx="2.5" stroke="currentColor" stroke-width="1.8" />
                    <path d="M8 3.75v3M16 3.75v3M3.75 9.75h16.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                  </svg>
                  <span class="truncate text-sm font-black">{{ t('home.heroSearchWhen') }}</span>
                </div>
                <p class="mt-1 truncate text-sm font-bold text-black/60">{{ heroSearchDate }}</p>
              </div>
            </div>
          </div>

          <div class="flex h-[4.25rem] w-[4.25rem] shrink-0 items-center justify-center border-2 border-black bg-brand-primary text-black shadow-brutal">
            <svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="5.5" stroke="currentColor" stroke-width="2.2" />
              <path d="m16 16 4 4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
            </svg>
            <span class="sr-only">{{ t('home.searchWithFilters') }}</span>
          </div>
        </div>
      </NuxtLink>
    </section>

    <section class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-black">{{ t('home.sportsTitle') }}</h2>
          <p class="text-xs font-bold text-black/70">{{ t('home.sportsSubtitle') }}</p>
        </div>
      </div>

      <div class="flex gap-2 overflow-x-auto pb-1">
        <button
          v-for="s in sports"
          :key="s.slug"
          type="button"
          class="shrink-0 rounded-brutal border-2 px-4 py-2 text-sm font-black transition"
          :class="sport === s.slug ? 'border-black bg-brand-accent text-black shadow-brutal' : 'border-black bg-white text-black shadow-brutal-sm hover:-translate-y-0.5 hover:shadow-brutal'"
          @click="sport = s.slug"
        >
          {{ localizedField(s, 'nameFa', 'nameEn') }}
        </button>
      </div>
    </section>

    <section class="ios-card overflow-hidden p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="font-black">{{ t('home.mapSectionTitle') }}</h2>
          <p class="text-xs font-bold text-black/70">{{ t('home.mapSectionBody') }}</p>
        </div>
        <NuxtLink :to="bookingLink('/clubs')" class="neo-badge">{{ t('home.seeAll') }}</NuxtLink>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(240px,0.9fr)]">
        <div class="overflow-hidden rounded-brutal border-2 border-black bg-brand-lavender shadow-brutal">
          <div class="relative min-h-[320px]">
            <iframe
              v-if="selectedMapEmbedUrl"
              :src="selectedMapEmbedUrl"
              class="absolute inset-0 h-full w-full border-0"
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"
              :title="t('home.mapSectionTitle')"
            />
            <div v-else class="flex h-[320px] items-center justify-center px-6 text-center text-sm font-bold text-black/70">
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
                  class="rounded-brutal border-2 px-3 py-2 text-start shadow-brutal transition-transform"
                  :class="selectedMapClubSlug === club.slug ? 'border-black bg-brand-accent text-black scale-105' : 'border-black bg-white text-black'"
                >
                  <div class="flex items-center gap-2">
                    <span
                      class="flex h-3.5 w-3.5 shrink-0 items-center justify-center border border-black"
                      :class="selectedMapClubSlug === club.slug ? 'bg-black' : 'bg-brand-primary'"
                    >
                      <span
                        class="h-1.5 w-1.5"
                        :class="selectedMapClubSlug === club.slug ? 'bg-brand-accent' : 'bg-black'"
                      />
                    </span>
                    <span class="max-w-[9.5rem] truncate text-[11px] font-black">{{ localizedField(club, 'nameFa', 'nameEn') }}</span>
                  </div>
                  <p class="mt-1 text-[11px] font-black" :class="selectedMapClubSlug === club.slug ? 'text-black/85' : 'text-black'">
                    {{ formatCurrency(club.priceFrom) }}
                  </p>
                </div>
              </button>
            </div>
            <div class="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent" />
          </div>
        </div>

        <div v-if="selectedMapClub" class="rounded-brutal border-2 border-black bg-brand-mint p-4 shadow-brutal">
          <p class="text-xs font-black text-black">{{ t('home.mapSelectedLabel') }}</p>
          <h3 class="mt-2 text-lg font-black">{{ localizedField(selectedMapClub, 'nameFa', 'nameEn') }}</h3>
          <p class="mt-1 text-xs font-bold text-black/70">
            {{ selectedMapClub.city }}<span v-if="selectedMapClub.district"> · {{ selectedMapClub.district }}</span>
          </p>
          <p class="mt-3 text-sm font-black text-black">{{ formatCurrency(selectedMapClub.priceFrom) }}</p>
          <p class="mt-1 text-xs font-bold text-black/70">⭐ {{ selectedMapClub.rating }} · {{ selectedMapClub.reviewCount }} {{ t('clubs.reviews') }}</p>

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
      <div class="neo-card-yellow p-4">
        <div class="flex h-10 w-10 items-center justify-center border-2 border-black bg-white text-black shadow-brutal-sm">⌁</div>
        <p class="mt-3 font-black">{{ t('home.bookingsTileTitle') }}</p>
        <p class="mt-1 text-xs font-bold text-black/70">{{ t('home.bookingsTileBody') }}</p>
        <NuxtLink :to="bookingsTileLink" class="mt-4 inline-flex text-sm font-black text-black underline">
          {{ t('home.bookingsTileAction') }}
        </NuxtLink>
      </div>

      <div class="neo-card-sky p-4">
        <div class="flex h-10 w-10 items-center justify-center border-2 border-black bg-white text-black shadow-brutal-sm">⌂</div>
        <p class="mt-3 font-black">{{ t('home.roleTileTitle') }}</p>
        <p class="mt-1 text-xs font-bold text-black/70">{{ user ? t('home.roleTileSignedIn') : t('home.roleTileGuest') }}</p>
        <NuxtLink :to="roleShortcut?.to || localePath('/login')" class="mt-4 inline-flex text-sm font-black text-black underline">
          {{ roleShortcut?.label || t('nav.login') }}
        </NuxtLink>
      </div>
    </section>

    <section class="ios-card p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="font-black">{{ t('home.clubSectionTitle') }}</h2>
          <p class="text-xs font-bold text-black/70">{{ t('home.clubSectionBody') }}</p>
        </div>
        <NuxtLink :to="bookingLink('/clubs')" class="neo-badge">{{ t('home.seeAll') }}</NuxtLink>
      </div>

      <div class="mt-4 space-y-3">
        <NuxtLink
          v-for="club in highlightedClubs"
          :key="club.id"
          :to="localePath(`/clubs/${club.slug}`)"
          class="flex items-center gap-3 border-b-2 border-black pb-3 last:border-b-0 last:pb-0"
        >
          <img :src="club.image || '/demo/clubs/padel-zone-tehran.jpg'" alt="" class="h-14 w-14 border-2 border-black object-cover shadow-brutal-sm" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-black">{{ localizedField(club, 'nameFa', 'nameEn') }}</p>
            <p class="mt-0.5 text-xs font-bold text-black/70">{{ club.city }} · ⭐ {{ club.rating }}</p>
            <p class="mt-1 text-xs font-black text-black">{{ formatCurrency(club.priceFrom) }}</p>
          </div>
          <span class="neo-badge">{{ t('home.clubCta') }}</span>
        </NuxtLink>
      </div>
    </section>

    <section class="ios-card p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="font-black">{{ t('home.coachSectionTitle') }}</h2>
          <p class="text-xs font-bold text-black/70">{{ t('home.coachSectionBody') }}</p>
        </div>
        <NuxtLink :to="bookingLink('/coaches')" class="neo-badge">{{ t('home.seeAll') }}</NuxtLink>
      </div>

      <div class="mt-4 space-y-3">
        <NuxtLink
          v-for="coach in highlightedCoaches"
          :key="coach.id"
          :to="localePath(`/coaches/${coach.id}`)"
          class="flex items-center gap-3 border-b-2 border-black pb-3 last:border-b-0 last:pb-0"
        >
          <img :src="coach.photo || '/demo/coaches/coach-1.jpg'" alt="" class="h-14 w-14 border-2 border-black object-cover shadow-brutal-sm" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-black">{{ localizedField(coach, 'nameFa', 'nameEn') }}</p>
            <p class="mt-0.5 truncate text-xs font-bold text-black/70">{{ formatSpecialties(coach.specialties) }}</p>
            <p class="mt-1 text-xs font-black text-black">{{ formatCurrency(coach.sessionPrice) }}</p>
          </div>
          <span class="neo-badge">{{ t('home.coachCta') }}</span>
        </NuxtLink>
      </div>
    </section>

    <section class="grid gap-2 sm:grid-cols-3">
      <div class="neo-card-lavender p-3 text-center">
        <p class="text-sm font-black">{{ t('home.utilityFastTitle') }}</p>
        <p class="mt-1 text-xs font-bold text-black/70">{{ t('home.utilityFastBody') }}</p>
      </div>
      <div class="neo-card-mint p-3 text-center">
        <p class="text-sm font-black">{{ t('home.utilityLocaleTitle') }}</p>
        <p class="mt-1 text-xs font-bold text-black/70">{{ t('home.utilityLocaleBody') }}</p>
      </div>
      <div class="neo-card-yellow p-3 text-center">
        <p class="text-sm font-black">{{ t('home.utilityPwaTitle') }}</p>
        <p class="mt-1 text-xs font-bold text-black/70">{{ t('home.utilityPwaBody') }}</p>
      </div>
    </section>

    <PwaInstallBanner />
  </div>
</template>
