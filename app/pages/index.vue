<script setup lang="ts">
const { t } = useI18n()
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

watchEffect(() => {
  if (!import.meta.client || !user.value) return
  const shortcut = user.value.role === 'ATHLETE'
    ? '/athlete/bookings'
    : user.value.role === 'COACH'
      ? '/coach'
      : user.value.role === 'OWNER'
        ? '/owner'
        : null
  // #region agent log
  fetch('http://127.0.0.1:7459/ingest/150d6ec9-7ea4-4890-8fdc-843d504b2806',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1a314a'},body:JSON.stringify({sessionId:'1a314a',runId:'pre-fix',hypothesisId:'C',location:'app/pages/index.vue',message:'home role shortcut evaluated',data:{role:user.value.role,shortcut},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
})

const highlightedClubs = computed(() => clubs.value?.slice(0, 2) || [])
const highlightedCoaches = computed(() => coaches.value?.slice(0, 2) || [])
const firstName = computed(() => user.value?.name?.split(' ')[0] || t('home.guestName'))
const selectedMapClubSlug = ref<string | null>(null)
const activeSportLabel = computed(() => {
  const match = sports.value?.find((item) => item.slug === sport.value)
  return match ? localizedField(match, 'nameFa', 'nameEn') : t('home.sportsLabel')
})
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

if (import.meta.server) {
  // #region agent log
  fetch('http://127.0.0.1:7459/ingest/150d6ec9-7ea4-4890-8fdc-843d504b2806',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1a314a'},body:JSON.stringify({sessionId:'1a314a',runId:'pre-fix-home',hypothesisId:'C',location:'app/pages/index.vue',message:'home server role shortcut evaluated',data:{role:user.value?.role ?? null,shortcut:roleShortcut.value?.to ?? null,label:roleShortcut.value?.label ?? null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
}

function bookingLink(path: '/clubs' | '/coaches') {
  return localePath({
    path,
    query: sport.value ? { sport: sport.value } : {},
  })
}

const mappableClubs = computed(() => {
  const list = (clubs.value || []).filter((club) => typeof club.lat === 'number' && typeof club.lng === 'number')
  if (!list.length) return []

  const lats = list.map((club) => club.lat as number)
  const lngs = list.map((club) => club.lng as number)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const latSpan = maxLat - minLat || 1
  const lngSpan = maxLng - minLng || 1

  return list.map((club) => {
    const top = 18 + ((maxLat - (club.lat as number)) / latSpan) * 64
    const left = 12 + (((club.lng as number) - minLng) / lngSpan) * 76
    return {
      ...club,
      top: `${top}%`,
      left: `${left}%`,
    }
  })
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

function handleHeroSportIconError() {
  if (heroSportIcon.value !== '/icons/sports/tennis.svg') {
    heroSportIcon.value = '/icons/sports/tennis.svg'
  }
}
</script>

<template>
  <div class="space-y-4 animate-fade-in">
    <section class="ios-card overflow-hidden bg-gradient-to-br from-brand-primary-dark via-brand-primary-dark to-brand-primary p-4 text-white shadow-card">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-bold uppercase tracking-[0.2em] text-white/70">{{ t('home.eyebrow') }}</p>
          <h1 class="mt-2 max-w-xs text-2xl font-black leading-tight">
            {{ t('home.welcome', { name: firstName }) }}
          </h1>
          <p class="mt-2 max-w-sm text-sm text-white/80">{{ t('home.heroBody') }}</p>
        </div>
        <NuxtLink
          :to="user ? localePath('/athlete') : localePath('/login')"
          class="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white backdrop-blur"
        >
          {{ user ? t('nav.me') : t('nav.login') }}
        </NuxtLink>
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
    </section>

    <section class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-black">{{ t('home.sportsTitle') }}</h2>
          <p class="text-xs text-brand-gray-600">{{ t('home.sportsSubtitle') }}</p>
        </div>
        <span class="rounded-full bg-white px-3 py-1 text-xs font-bold text-brand-primary shadow-card">{{ activeSportLabel }}</span>
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
        <div class="relative min-h-[320px] overflow-hidden rounded-[28px] border border-black/5 bg-[radial-gradient(circle_at_top,_rgba(196,30,30,0.14),_transparent_35%),linear-gradient(180deg,_#f7f1eb_0%,_#efe6dd_100%)]">
          <div class="pointer-events-none absolute inset-0 opacity-70">
            <div class="absolute inset-x-[12%] top-[18%] h-px bg-brand-primary/10" />
            <div class="absolute inset-x-[8%] top-[42%] h-px bg-brand-primary/10" />
            <div class="absolute inset-x-[16%] top-[68%] h-px bg-brand-primary/10" />
            <div class="absolute inset-y-[14%] left-[24%] w-px bg-brand-primary/10" />
            <div class="absolute inset-y-[18%] left-[54%] w-px bg-brand-primary/10" />
            <div class="absolute inset-y-[12%] left-[76%] w-px bg-brand-primary/10" />
            <div class="absolute left-[10%] top-[14%] h-28 w-28 rounded-full bg-brand-primary/6 blur-2xl" />
            <div class="absolute right-[8%] top-[52%] h-24 w-24 rounded-full bg-brand-gold/15 blur-2xl" />
          </div>

          <div class="absolute inset-0">
            <button
              v-for="club in mappableClubs"
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

          <div class="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-brand-gray-700 shadow-card">
            {{ activeSportLabel }}
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
