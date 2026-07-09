<script setup lang="ts">
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency } = useFormatters()
const { user, fetch: fetchAuth } = useAuth()

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
const firstName = computed(() => user.value?.name?.split(' ')[0] || t('home.guestName'))
const selectedMapClubSlug = ref<string | null>(null)
const heroSportIcon = ref(`/icons/sports/${sport.value || 'padel'}.svg`)
watch(sport, (value) => {
  heroSportIcon.value = `/icons/sports/${value || 'padel'}.svg`
}, { immediate: true })
const roleShortcut = computed(() => {
  if (!user.value) return null
  if (user.value.role === 'ATHLETE') return { label: t('nav.bookings'), to: localePath('/athlete/bookings') }
  if (user.value.role === 'COACH') return { label: t('coach.schedule'), to: localePath('/coach') }
  if (user.value.role === 'OWNER') return { label: t('owner.calendar'), to: localePath('/owner') }
  return null
})
const heroSearchDate = computed(() => {
  return new Intl.DateTimeFormat(locale.value === 'fa' ? 'fa-IR' : 'en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date())
})

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
  <div class="space-y-4 animate-fade-in">
    <section class="ios-card overflow-hidden bg-gradient-to-br from-brand-primary-dark via-brand-primary-dark to-brand-primary p-4 text-white shadow-card">
      <div>
        <div>
          <p class="text-xs font-bold tracking-[0.2em] text-white/70" :class="locale === 'en' ? 'uppercase' : ''">{{ t('home.eyebrow') }}</p>
          <h1 class="mt-2 max-w-xs text-2xl font-black leading-tight">
            {{ t('home.welcome', { name: firstName }) }}
          </h1>
          <p class="mt-2 max-w-sm text-sm text-white/80">{{ t('home.heroBody') }}</p>
        </div>
      </div>

      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <NuxtLink :to="bookingLink('/clubs')" class="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
          <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12">
            <img :src="heroSportIcon" alt="" class="h-6 w-6" @error="handleHeroSportIconError" />
          </div>
          <p class="mt-4 text-base font-black">{{ t('home.bookCourt') }}</p>
          <p class="mt-1 text-xs text-white/75">{{ t('home.bookCourtHint') }}</p>
        </NuxtLink>

        <NuxtLink :to="bookingLink('/coaches')" class="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
          <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12 text-lg">◌</div>
          <p class="mt-4 text-base font-black">{{ t('home.findCoach') }}</p>
          <p class="mt-1 text-xs text-white/75">{{ t('home.findCoachHint') }}</p>
        </NuxtLink>
      </div>

      <NuxtLink
        :to="bookingLink('/clubs')"
        class="mt-4 block rounded-[2rem] bg-white p-2 text-brand-gray-900 shadow-[0_16px_42px_rgba(0,0,0,0.16)] transition hover:-translate-y-0.5"
      >
        <div class="flex items-center gap-2">
          <div class="flex h-[4.25rem] w-[4.25rem] shrink-0 items-center justify-center rounded-[1.6rem] bg-brand-primary/8 text-brand-primary shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
            <img :src="heroSportIcon" alt="" class="h-10 w-10" @error="handleHeroSportIconError" />
          </div>

          <div class="min-w-0 flex-1">
            <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-2 md:grid-cols-[minmax(0,1.55fr)_auto_minmax(0,1fr)]">
              <div class="min-w-0 rounded-[1.45rem] px-3 py-2.5">
                <div class="flex items-center gap-2 text-brand-gray-900">
                  <svg class="h-4 w-4 shrink-0 text-brand-gray-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 21s6-4.35 6-10a6 6 0 1 0-12 0c0 5.65 6 10 6 10Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                    <circle cx="12" cy="11" r="2.2" stroke="currentColor" stroke-width="1.8" />
                  </svg>
                  <span class="truncate text-sm font-black">{{ t('home.heroSearchWhere') }}</span>
                </div>
                <p class="mt-1 truncate text-sm text-brand-gray-500">{{ t('home.heroSearchWhereHint') }}</p>
              </div>

              <div class="hidden items-center justify-center md:flex">
                <div class="flex h-11 w-11 items-center justify-center rounded-2xl border border-black/8 bg-white text-brand-gray-500 shadow-sm">
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="m5 12 14-7-4.5 14-2.8-5-6.7-2Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </div>
              </div>

              <div class="min-w-0 border-l border-black/8 px-3 py-2.5">
                <div class="flex items-center gap-2 text-brand-gray-900">
                  <svg class="h-4 w-4 shrink-0 text-brand-gray-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3.75" y="5.25" width="16.5" height="15" rx="2.5" stroke="currentColor" stroke-width="1.8" />
                    <path d="M8 3.75v3M16 3.75v3M3.75 9.75h16.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                  </svg>
                  <span class="truncate text-sm font-black">{{ t('home.heroSearchWhen') }}</span>
                </div>
                <p class="mt-1 truncate text-sm text-brand-gray-500">{{ heroSearchDate }}</p>
              </div>
            </div>
          </div>

          <div class="flex h-[4.25rem] w-[4.25rem] shrink-0 items-center justify-center rounded-[1.6rem] bg-brand-primary text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]">
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
          <p class="text-xs text-brand-gray-600">{{ t('home.sportsSubtitle') }}</p>
        </div>
      </div>

      <div class="flex gap-2 overflow-x-auto pb-1">
        <button
          v-for="s in sports"
          :key="s.slug"
          type="button"
          class="shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition"
          :class="sport === s.slug ? 'border-brand-primary bg-brand-primary text-white' : 'border-black/10 bg-white text-brand-gray-700'"
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
          <p class="text-xs text-brand-gray-600">{{ t('home.mapSectionBody') }}</p>
        </div>
        <NuxtLink :to="bookingLink('/clubs')" class="text-xs font-bold text-brand-primary">{{ t('home.seeAll') }}</NuxtLink>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(240px,0.9fr)]">
        <div class="overflow-hidden rounded-[28px] border border-black/5 bg-brand-cream/40">
          <div class="relative min-h-[320px]">
            <iframe
              v-if="selectedMapEmbedUrl"
              :src="selectedMapEmbedUrl"
              class="absolute inset-0 h-full w-full border-0"
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"
              :title="t('home.mapSectionTitle')"
            />
            <div v-else class="flex h-[320px] items-center justify-center px-6 text-center text-sm text-brand-gray-600">
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
                  class="rounded-2xl border px-3 py-2 text-start shadow-card backdrop-blur-sm"
                  :class="selectedMapClubSlug === club.slug ? 'border-brand-primary bg-brand-primary text-white scale-105' : 'border-black/5 bg-white/92 text-brand-gray-900'"
                >
                  <div class="flex items-center gap-2">
                    <span
                      class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full"
                      :class="selectedMapClubSlug === club.slug ? 'bg-white/25' : 'bg-brand-primary/12'"
                    >
                      <span
                        class="h-1.5 w-1.5 rounded-full"
                        :class="selectedMapClubSlug === club.slug ? 'bg-white' : 'bg-brand-primary'"
                      />
                    </span>
                    <span class="max-w-[9.5rem] truncate text-[11px] font-black">{{ localizedField(club, 'nameFa', 'nameEn') }}</span>
                  </div>
                  <p class="mt-1 text-[11px] font-bold" :class="selectedMapClubSlug === club.slug ? 'text-white/85' : 'text-brand-primary'">
                    {{ formatCurrency(club.priceFrom) }}
                  </p>
                </div>
              </button>
            </div>
            <div class="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/10 to-transparent" />
          </div>
        </div>

        <div v-if="selectedMapClub" class="rounded-[24px] border border-black/5 bg-brand-cream/60 p-4">
          <p class="text-xs font-bold text-brand-primary">{{ t('home.mapSelectedLabel') }}</p>
          <h3 class="mt-2 text-lg font-black">{{ localizedField(selectedMapClub, 'nameFa', 'nameEn') }}</h3>
          <p class="mt-1 text-xs text-brand-gray-600">
            {{ selectedMapClub.city }}<span v-if="selectedMapClub.district"> · {{ selectedMapClub.district }}</span>
          </p>
          <p class="mt-3 text-sm font-black text-brand-primary">{{ formatCurrency(selectedMapClub.priceFrom) }}</p>
          <p class="mt-1 text-xs text-brand-gray-600">⭐ {{ selectedMapClub.rating }} · {{ selectedMapClub.reviewCount }} {{ t('clubs.reviews') }}</p>

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
      <div class="ios-card p-4">
        <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">⌁</div>
        <p class="mt-3 font-black">{{ t('home.bookingsTileTitle') }}</p>
        <p class="mt-1 text-xs text-brand-gray-600">{{ t('home.bookingsTileBody') }}</p>
        <NuxtLink :to="user ? localePath('/athlete/bookings') : localePath('/login')" class="mt-4 inline-flex text-sm font-bold text-brand-primary">
          {{ t('home.bookingsTileAction') }}
        </NuxtLink>
      </div>

      <div class="ios-card p-4">
        <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">⌂</div>
        <p class="mt-3 font-black">{{ t('home.roleTileTitle') }}</p>
        <p class="mt-1 text-xs text-brand-gray-600">{{ user ? t('home.roleTileSignedIn') : t('home.roleTileGuest') }}</p>
        <NuxtLink :to="roleShortcut?.to || localePath('/login')" class="mt-4 inline-flex text-sm font-bold text-brand-primary">
          {{ roleShortcut?.label || t('nav.login') }}
        </NuxtLink>
      </div>
    </section>

    <section class="ios-card p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="font-black">{{ t('home.clubSectionTitle') }}</h2>
          <p class="text-xs text-brand-gray-600">{{ t('home.clubSectionBody') }}</p>
        </div>
        <NuxtLink :to="bookingLink('/clubs')" class="text-xs font-bold text-brand-primary">{{ t('home.seeAll') }}</NuxtLink>
      </div>

      <div class="mt-4 space-y-3">
        <NuxtLink
          v-for="club in highlightedClubs"
          :key="club.id"
          :to="localePath(`/clubs/${club.slug}`)"
          class="flex items-center gap-3 border-b border-black/5 pb-3 last:border-b-0 last:pb-0"
        >
          <img :src="club.image || '/demo/clubs/padel-zone-tehran.jpg'" alt="" class="h-14 w-14 rounded-2xl object-cover" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-bold">{{ localizedField(club, 'nameFa', 'nameEn') }}</p>
            <p class="mt-0.5 text-xs text-brand-gray-600">{{ club.city }} · ⭐ {{ club.rating }}</p>
            <p class="mt-1 text-xs font-bold text-brand-primary">{{ formatCurrency(club.priceFrom) }}</p>
          </div>
          <span class="rounded-full bg-brand-primary/10 px-2.5 py-1 text-[11px] font-bold text-brand-primary">{{ t('home.clubCta') }}</span>
        </NuxtLink>
      </div>
    </section>

    <section class="ios-card p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="font-black">{{ t('home.coachSectionTitle') }}</h2>
          <p class="text-xs text-brand-gray-600">{{ t('home.coachSectionBody') }}</p>
        </div>
        <NuxtLink :to="bookingLink('/coaches')" class="text-xs font-bold text-brand-primary">{{ t('home.seeAll') }}</NuxtLink>
      </div>

      <div class="mt-4 space-y-3">
        <NuxtLink
          v-for="coach in highlightedCoaches"
          :key="coach.id"
          :to="localePath(`/coaches/${coach.id}`)"
          class="flex items-center gap-3 border-b border-black/5 pb-3 last:border-b-0 last:pb-0"
        >
          <img :src="coach.photo || '/demo/coaches/coach-1.jpg'" alt="" class="h-14 w-14 rounded-2xl object-cover" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-bold">{{ localizedField(coach, 'nameFa', 'nameEn') }}</p>
            <p class="mt-0.5 truncate text-xs text-brand-gray-600">{{ coach.specialties?.slice(0, 2).join(' · ') || t('home.coachSessionsLabel') }}</p>
            <p class="mt-1 text-xs font-bold text-brand-primary">{{ formatCurrency(coach.sessionPrice) }}</p>
          </div>
          <span class="rounded-full bg-brand-primary/10 px-2.5 py-1 text-[11px] font-bold text-brand-primary">{{ t('home.coachCta') }}</span>
        </NuxtLink>
      </div>
    </section>

    <section class="grid gap-2 sm:grid-cols-3">
      <div class="ios-card p-3 text-center">
        <p class="text-sm font-black">{{ t('home.utilityFastTitle') }}</p>
        <p class="mt-1 text-xs text-brand-gray-600">{{ t('home.utilityFastBody') }}</p>
      </div>
      <div class="ios-card p-3 text-center">
        <p class="text-sm font-black">{{ t('home.utilityLocaleTitle') }}</p>
        <p class="mt-1 text-xs text-brand-gray-600">{{ t('home.utilityLocaleBody') }}</p>
      </div>
      <div class="ios-card p-3 text-center">
        <p class="text-sm font-black">{{ t('home.utilityPwaTitle') }}</p>
        <p class="mt-1 text-xs text-brand-gray-600">{{ t('home.utilityPwaBody') }}</p>
      </div>
    </section>

    <PwaInstallBanner />
  </div>
</template>
