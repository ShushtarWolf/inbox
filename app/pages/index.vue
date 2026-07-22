<script setup lang="ts">
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { user, fetch: fetchAuth, firstName } = useAuth()
const { openGate, openLogin, openRegister } = useAuthFlow()

const sport = ref<string | undefined>(undefined)
const heroSlide = ref(0)

const { data: sports, pending: sportsPending } = await useFetch('/api/sports')
if (!sport.value && sports.value?.length) {
  sport.value = sports.value[0]?.slug
}

/** Unfiltered clubs so Canva rails (suggestions / tennis / padel) stay populated. */
const { data: clubs, pending: clubsPending } = await useFetch('/api/clubs')

const pagePending = computed(() => sportsPending.value || clubsPending.value)

const firstNameOrGuest = computed(() => firstName.value || t('home.guestName'))
const suggestedClubs = computed(() => clubs.value?.slice(0, 6) || [])
const tennisClubs = computed(() => {
  const list = clubs.value || []
  return list.filter((club) => club.sports?.includes('tennis')).slice(0, 6)
})
const padelClubs = computed(() => {
  const list = clubs.value || []
  return list.filter((club) => club.sports?.includes('padel')).slice(0, 6)
})

const heroSlides = computed(() => [
  {
    title: t('home.heroSlideTitle'),
    body: t('home.heroBody'),
    image: '/hero/inbox-brand-court.jpg',
  },
  {
    title: t('home.bookCourt'),
    body: t('home.bookCourtHint'),
    image: '/hero/tennis-court.jpg',
  },
  {
    title: t('home.padelTitle'),
    body: t('home.clubSectionBody'),
    image: '/hero/padel-court.jpg',
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
  return localePath({
    path,
    query: (querySport || sport.value) ? { sport: querySport || sport.value } : {},
  })
}

function clubMeta(club: { city?: string; rating?: number; sports?: string[] }) {
  const sportSlug = club.sports?.[0]
  const sportName = sports.value?.find((item) => item.slug === sportSlug)
  const label = sportName ? localizedField(sportName, 'nameFa', 'nameEn') : t('home.sportsLabel')
  return `${club.city || 'تهران'} | ${label} | ${(club.rating ?? 4.5).toFixed(1)}`
}

function nextHero() {
  heroSlide.value = (heroSlide.value + 1) % heroSlides.value.length
}

function prevHero() {
  heroSlide.value = (heroSlide.value - 1 + heroSlides.value.length) % heroSlides.value.length
}

watch(sports, (list) => {
  if (!sport.value && list?.length) sport.value = list[0]?.slug
})
</script>

<template>
  <AppAsyncState :pending="pagePending" skeleton-variant="stat-grid">
    <div class="tail-page-stack animate-fade-in tail-stagger">
      <section class="canva-hero">
        <img
          :src="activeHero?.image"
          alt=""
          class="canva-hero-media"
        />
        <div class="canva-hero-content">
          <div class="flex items-start justify-between gap-3">
            <button
              v-if="!user"
              type="button"
              class="btn-primary px-3 py-1.5 text-xs"
              @click="openGate()"
            >
              {{ t('auth.loginRegister') }}
            </button>
            <p v-else class="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-bold backdrop-blur">
              {{ t('home.welcome', { name: firstNameOrGuest }) }}
            </p>
            <div class="flex items-center gap-2">
              <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7 brightness-0 invert" />
              <span class="font-display text-lg font-bold tracking-wide">INBOX</span>
            </div>
          </div>

          <div class="mt-auto space-y-2 pt-10">
            <h1 class="max-w-xs text-3xl font-bold leading-none">{{ activeHero?.title }}</h1>
            <p class="max-w-sm text-sm text-white/90">{{ activeHero?.body }}</p>
          </div>

          <div class="mt-4 flex items-center justify-between">
            <button type="button" class="rounded-full bg-white/15 p-2 backdrop-blur" :aria-label="t('calendar.prevMonth')" @click="prevHero">
              <AppIcon name="chevron_right" size="sm" />
            </button>
            <div class="flex gap-1.5">
              <button
                v-for="(_, index) in heroSlides"
                :key="index"
                type="button"
                class="h-1.5 w-1.5 rounded-full"
                :class="index === heroSlide ? 'bg-white' : 'bg-white/40'"
                @click="heroSlide = index"
              />
            </div>
            <button type="button" class="rounded-full bg-white/15 p-2 backdrop-blur" :aria-label="t('calendar.nextMonth')" @click="nextHero">
              <AppIcon name="chevron_left" size="sm" />
            </button>
          </div>
        </div>
      </section>

      <section class="canva-search-row">
        <div>
          <p class="text-[11px] font-bold text-brand-gray-600">{{ t('home.heroSearchWhere') }}</p>
          <NuxtLink :to="bookingLink('/clubs')" class="mt-1 block truncate text-sm font-bold text-brand-navy">
            {{ t('home.heroSearchWhereHint') }}
          </NuxtLink>
        </div>
        <div>
          <p class="text-[11px] font-bold text-brand-gray-600">{{ t('home.heroSearchWhen') }}</p>
          <p class="mt-1 truncate text-sm font-bold text-brand-navy">{{ heroSearchDate }}</p>
        </div>
        <div>
          <p class="text-[11px] font-bold text-brand-gray-600">{{ t('home.sportsTitle') }}</p>
          <select v-model="sport" class="mt-1 w-full border-0 bg-transparent p-0 text-sm font-bold text-brand-navy outline-none">
            <option v-for="s in sports" :key="s.slug" :value="s.slug">
              {{ localizedField(s, 'nameFa', 'nameEn') }}
            </option>
          </select>
        </div>
        <NuxtLink :to="bookingLink('/clubs')" class="btn-primary px-4 py-2 text-xs">
          {{ t('home.searchWithFilters') }}
        </NuxtLink>
      </section>

      <section class="space-y-3">
        <div class="flex items-end justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold text-brand-primary">{{ t('home.suggestionsTitle') }}</h2>
            <p class="text-xs text-brand-gray-600">{{ t('home.suggestionsBody') }}</p>
          </div>
          <NuxtLink :to="bookingLink('/clubs')" class="text-xs font-bold text-brand-navy">{{ t('home.seeAll') }}</NuxtLink>
        </div>
        <div v-if="suggestedClubs.length" class="canva-rail">
          <NuxtLink
            v-for="club in suggestedClubs"
            :key="club.id"
            :to="localePath(`/book/court/${club.slug}`)"
            class="canva-venue-card"
          >
            <img :src="club.image || '/placeholders/club.svg'" alt="" />
            <div class="canva-venue-card-body">
              <p class="text-sm font-bold">{{ localizedField(club, 'nameFa', 'nameEn') }}</p>
              <p class="text-[10px] text-white/85">{{ clubMeta(club) }}</p>
              <span class="btn-primary px-3 py-1 text-[11px]">{{ t('home.bookNow') }}</span>
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
        <div v-if="tennisClubs.length" class="canva-rail">
          <NuxtLink
            v-for="club in tennisClubs"
            :key="`tennis-${club.id}`"
            :to="localePath(`/book/court/${club.slug}`)"
            class="canva-venue-card"
          >
            <img :src="club.image || '/placeholders/club.svg'" alt="" />
            <div class="canva-venue-card-body">
              <p class="text-sm font-bold">{{ localizedField(club, 'nameFa', 'nameEn') }}</p>
              <p class="text-[10px] text-white/85">{{ clubMeta(club) }}</p>
              <span class="btn-primary px-3 py-1 text-[11px]">{{ t('home.bookNow') }}</span>
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
        <div v-if="padelClubs.length" class="canva-rail">
          <NuxtLink
            v-for="club in padelClubs"
            :key="`padel-${club.id}`"
            :to="localePath(`/book/court/${club.slug}`)"
            class="canva-venue-card"
          >
            <img :src="club.image || '/placeholders/club.svg'" alt="" />
            <div class="canva-venue-card-body">
              <p class="text-sm font-bold">{{ localizedField(club, 'nameFa', 'nameEn') }}</p>
              <p class="text-[10px] text-white/85">{{ clubMeta(club) }}</p>
              <span class="btn-primary px-3 py-1 text-[11px]">{{ t('home.bookNow') }}</span>
            </div>
          </NuxtLink>
        </div>
        <p v-else class="text-sm text-brand-gray-600">{{ t('common.empty') }}</p>
      </section>

      <section v-if="!user" class="rounded-xl border border-brand-gray-200 bg-white p-4 text-center shadow-venus-sm">
        <p class="text-sm font-bold text-brand-navy">{{ t('auth.gateTitle') }}</p>
        <p class="mt-1 text-xs text-brand-gray-600">{{ t('home.roleTileGuest') }}</p>
        <div class="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" class="btn-primary flex-1" @click="openRegister()">{{ t('auth.register') }}</button>
          <button type="button" class="btn-canva-login flex-1" @click="openLogin()">{{ t('auth.loginWithPhone') }}</button>
        </div>
      </section>
    </div>
  </AppAsyncState>
</template>
