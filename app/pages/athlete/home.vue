<script setup lang="ts">
/** Canva p25: personalized athlete home inside phone shell (not public layout). */
import { isPastDate } from '#shared/localDate.ts'
import { normalizeTod, type TimeOfDayPref } from '#shared/timeOfDay.ts'

definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { firstName, displayName } = useAuth()
const { competitionsEnabled, pilotNoCoach } = usePilotFlags()
const { formatWeekday, formatDayNumber, formatMonth, formatTimeLabel, formatNumber } = useFormatters()
const { canSwitchRole } = usePlatformRoles()

const sport = ref('')
const city = ref('')
const date = ref('')
const tod = ref<TimeOfDayPref>('')
const showDatePicker = ref(false)

function openAthleteDatePicker() {
  requestAnimationFrame(() => {
    showDatePicker.value = true
  })
}

const [{ data: sports, pending: sportsPending }, { data: clubs, pending: clubsPending }] = await Promise.all([
  useFetch('/api/sports'),
  useFetch('/api/clubs'),
])

const pagePending = computed(() => sportsPending.value || clubsPending.value)
const greetName = computed(() => firstName.value || displayName.value || t('home.guestName'))

const { data: myBookings } = useAuthedFetch<{
  courtBookings?: Array<{
    id: string
    status: string
    slot: { date: string; startTime: string; court: { nameFa?: string; nameEn?: string; club: { nameFa: string; nameEn: string; slug: string } } }
  }>
}>('/api/bookings/mine', { lazy: true })

const nextUpcomingBooking = computed(() => {
  const list = myBookings.value?.courtBookings || []
  const upcoming = list
    .filter((b) => b.status !== 'CANCELLED' && !isPastDate(b.slot.date))
    .sort((a, b) => {
      const da = `${a.slot.date}T${a.slot.startTime}`
      const db = `${b.slot.date}T${b.slot.startTime}`
      return da.localeCompare(db)
    })
  return upcoming[0] || null
})

function upcomingLabel(booking: NonNullable<typeof nextUpcomingBooking.value>) {
  const club = localizedField(booking.slot.court.club, 'nameFa', 'nameEn')
  const when = `${formatWeekday(booking.slot.date)} ${formatDayNumber(booking.slot.date)} ${formatMonth(booking.slot.date)}`
  const time = formatTimeLabel(booking.slot.startTime)
  return `${club} · ${when} · ${time}`
}

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

const suggestedClubs = computed(() => clubs.value?.slice(0, 4) || [])
const tennisClubs = computed(() => {
  const list = clubs.value || []
  return list.filter((club: { sports?: string[] }) => club.sports?.includes('tennis')).slice(0, 4)
})
const padelClubs = computed(() => {
  const list = clubs.value || []
  return list.filter((club: { sports?: string[] }) => club.sports?.includes('padel')).slice(0, 4)
})
const listedSports = computed(() => {
  const set = new Set<string>()
  for (const club of clubs.value || []) {
    for (const s of club.sports || []) set.add(s)
  }
  return set
})
const sportsForSearch = computed(() =>
  (sports.value || []).filter((item: { slug: string }) => listedSports.value.has(item.slug)),
)

function bookingLink(path: '/clubs', querySport?: string) {
  const sportQuery = querySport || sport.value || undefined
  const cityQuery = city.value || undefined
  const dateQuery = date.value || undefined
  const todQuery = normalizeTod(tod.value) || undefined
  const query: Record<string, string> = {}
  if (sportQuery) query.sport = sportQuery
  if (cityQuery) query.city = cityQuery
  if (dateQuery) query.date = dateQuery
  if (todQuery) query.tod = todQuery
  return localePath({ path, query })
}

function clubHref(slug: string) {
  const query: Record<string, string> = {}
  if (date.value) query.date = date.value
  const todQuery = normalizeTod(tod.value)
  if (todQuery) query.tod = todQuery
  return localePath({ path: `/clubs/${slug}`, query })
}

function onHomeDatePicked() {
  showDatePicker.value = false
}

function clubMeta(club: { city?: string; rating?: number | null; reviewCount?: number; sports?: string[] }) {
  const sportSlug = club.sports?.[0]
  const sportName = sports.value?.find((item) => item.slug === sportSlug)
  const label = sportName ? localizedField(sportName, 'nameFa', 'nameEn') : t('home.sportsLabel')
  const rating = club.reviewCount && club.rating != null
    ? ` | ${formatNumber(Number(club.rating.toFixed(1)))} ★`
    : ''
  return `${club.city || 'تهران'} | ${label}${rating}`
}

function clubImage(club: { image?: string | null; sports?: string[] }) {
  if (club.image) return club.image
  if (club.sports?.includes('padel')) return '/hero/padel-court.jpg'
  if (club.sports?.includes('tennis')) return '/hero/tennis-court.jpg'
  return '/hero/fitness-venue.jpg'
}

function clubImageAlt(club: { nameFa?: string; nameEn?: string }) {
  return t('home.clubImageAlt', { name: localizedField(club, 'nameFa', 'nameEn') })
}

</script>

<template>
  <div class="venus-page-stack athlete-home-page">
    <section class="canva-photo-hero">
      <CanvaHeroImg
        src="/hero/fitness-venue.jpg"
        :alt="t('athlete.homePickCourt')"
        img-class="canva-photo-hero-media"
        img-style="filter: grayscale(0.55) brightness(0.72);"
        fetchpriority="high"
      />
      <div class="canva-photo-hero-wash" />
      <!-- HTML m-athlete .mbt / .mbi: logo + bell + user -->
      <div class="canva-photo-hero-top">
        <InboxBrandLockup home-link on-dark height-class="h-7" />
        <div class="flex flex-col items-stretch gap-1">
          <div class="flex items-center gap-3.5 text-white">
            <NuxtLink :to="localePath('/athlete/notifications')" :aria-label="t('athlete.notifications')">
              <AppIcon name="notifications" size="sm" />
            </NuxtLink>
            <NuxtLink :to="localePath('/athlete')" :aria-label="t('nav.profile')">
              <AppIcon name="person" size="sm" />
            </NuxtLink>
          </div>
          <NuxtLink
            v-if="canSwitchRole"
            :to="localePath('/choose-role')"
            class="text-center text-[11px] font-semibold text-white"
          >
            {{ t('auth.changeRole') }}
          </NuxtLink>
        </div>
      </div>
      <div class="canva-photo-hero-body !min-h-[10.5rem]">
        <h1 class="canva-page-hero-title text-2xl">{{ t('athlete.homeGreeting', { name: greetName }) }}</h1>
        <p class="mt-1 text-sm text-white/85">{{ t('athlete.homePickCourt') }}</p>
      </div>
    </section>

    <AppAsyncState :pending="pagePending" skeleton-variant="stat-grid">
      <!-- HTML athlete-home .rsearch: CTA + تاریخ + شهر + ورزش -->
      <section>
        <div class="canva-search-row">
          <NuxtLink :to="bookingLink('/clubs')" class="canva-search-cta">
            <AppIcon name="search" size="sm" />
            {{ t('common.search') }}
          </NuxtLink>
          <div class="canva-search-fields">
            <div class="canva-search-field">
              <label class="sr-only" for="athlete-home-date-btn">{{ t('home.heroSearchDate') }}</label>
              <button
                id="athlete-home-date-btn"
                type="button"
                class="canva-search-placeholder canva-search-date-btn"
                :class="{ 'canva-search-placeholder-filled': date }"
                @click="openAthleteDatePicker"
              >
                <span class="min-w-0 truncate">{{ dateFieldLabel }}</span>
                <AppIcon name="calendar_month" size="sm" />
              </button>
            </div>
            <div class="canva-search-field">
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
              <label class="sr-only" for="athlete-home-sport-select">{{ t('home.sportsTitle') }}</label>
              <select
                id="athlete-home-sport-select"
                v-model="sport"
                class="canva-search-placeholder"
                :class="{ 'canva-search-placeholder-filled': sport }"
              >
                <option value="">{{ t('home.sportsTitle') }}</option>
                <option v-for="s in sportsForSearch" :key="s.slug" :value="s.slug">
                  {{ localizedField(s, 'nameFa', 'nameEn') }}
                </option>
              </select>
            </div>
          </div>
        </div>
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
          <AppJalaliCalendar v-model="date" selected-tone="charcoal" @select="onHomeDatePicked" />
        </div>
      </AppModal>

      <CompetitionDiscoveryRail v-if="competitionsEnabled" />

      <section v-if="nextUpcomingBooking" class="canva-athlete-upcoming-card">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs font-bold text-brand-primary">{{ t('athlete.upcomingTitle') }}</p>
            <p class="mt-1 text-sm font-bold text-brand-navy">{{ upcomingLabel(nextUpcomingBooking) }}</p>
            <p class="mt-0.5 text-xs text-brand-gray-600">{{ t('athlete.upcomingBody') }}</p>
          </div>
          <NuxtLink
            :to="localePath('/athlete/bookings')"
            class="shrink-0 text-xs font-bold text-brand-primary"
          >
            {{ t('athlete.upcomingCta') }}
          </NuxtLink>
        </div>
      </section>

      <CoachDiscoveryRail v-if="!pilotNoCoach" />

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
            <CanvaHeroImg :src="clubImage(club)" :alt="clubImageAlt(club)" loading="lazy" />
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
            <CanvaHeroImg :src="clubImage(club)" :alt="clubImageAlt(club)" loading="lazy" />
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

      <section v-if="padelClubs.length" class="space-y-3">
        <div class="flex items-end justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold text-brand-primary">{{ t('home.padelTitle') }}</h2>
            <p class="text-xs text-brand-gray-600">{{ t('home.clubSectionBody') }}</p>
          </div>
          <NuxtLink :to="bookingLink('/clubs', 'padel')" class="text-xs font-bold text-brand-navy">{{ t('home.seeAll') }}</NuxtLink>
        </div>
        <div class="canva-venue-grid">
          <NuxtLink
            v-for="club in padelClubs"
            :key="`padel-${club.id}`"
            :to="clubHref(club.slug)"
            class="canva-venue-card"
          >
            <CanvaHeroImg :src="clubImage(club)" :alt="clubImageAlt(club)" loading="lazy" />
            <div class="canva-venue-card-body">
              <div class="canva-venue-card-copy">
                <p class="canva-venue-card-title">{{ localizedField(club, 'nameFa', 'nameEn') }}</p>
                <p class="canva-venue-card-meta">{{ clubMeta(club) }}</p>
              </div>
              <span class="canva-venue-card-cta">{{ t('home.bookNow') }}</span>
            </div>
          </NuxtLink>
        </div>
      </section>
    </AppAsyncState>
  </div>
</template>
