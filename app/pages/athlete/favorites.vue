<script setup lang="ts">
/** Canva p23: favorites with sport chips + rich court cards. */
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency } = useFormatters()
const { ids, removeFavorite } = useClubFavorites()
const { data: clubs, pending, error } = await useFetch('/api/clubs', { lazy: true })
const { data: sports } = await useFetch('/api/sports', { lazy: true })

const sportFilter = ref('')

const sportChips = computed(() => [
  { value: '', label: t('clubs.sportAll') },
  { value: 'tennis', label: t('home.tennisTitle') },
  { value: 'padel', label: t('home.padelTitle') },
])

const favorited = computed(() => {
  const list = clubs.value || []
  const set = new Set(ids.value)
  return list.filter((club: { id: string; sports?: string[] }) => {
    if (!set.has(club.id)) return false
    if (!sportFilter.value) return true
    return club.sports?.includes(sportFilter.value)
  })
})

function clubMeta(club: { city?: string; rating?: number; sports?: string[] }) {
  const sportSlug = club.sports?.[0]
  const sportName = sports.value?.find((item: { slug: string }) => item.slug === sportSlug)
  const label = sportName ? localizedField(sportName, 'nameFa', 'nameEn') : t('home.sportsLabel')
  const rating = club.rating != null ? club.rating.toFixed(1) : '—'
  return `${club.city || 'تهران'} | ${label} | ${rating}`
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

function blurb(club: { descriptionFa?: string | null; descriptionEn?: string | null }) {
  const text = localizedField(club, 'descriptionFa', 'descriptionEn') || t('athlete.favoritesCardFallback')
  return text.length > 110 ? `${text.slice(0, 110)}…` : text
}
</script>

<template>
  <div class="venus-page-stack">
    <section class="canva-photo-hero canva-photo-hero-curve -mx-4 sm:-mx-0">
      <img src="/hero/tennis-court.jpg" alt="" class="canva-photo-hero-media" style="filter: grayscale(0.4) brightness(0.7);" />
      <div class="canva-photo-hero-wash" />
      <div class="canva-photo-hero-top">
        <InboxWordmark class="text-base text-brand-primary" />
        <div class="flex items-center gap-3 text-white">
          <NuxtLink :to="localePath('/athlete/notifications')" :aria-label="t('athlete.notifications')">
            <AppIcon name="notifications" size="sm" />
          </NuxtLink>
          <NuxtLink :to="localePath('/athlete')" :aria-label="t('nav.profile')">
            <AppIcon name="person" size="sm" />
          </NuxtLink>
        </div>
      </div>
      <div class="canva-photo-hero-body !min-h-[8.5rem]">
        <h1 class="canva-page-hero-title text-xl">{{ t('athlete.favoritesTitle') }}</h1>
        <p class="mt-1 text-sm text-white/85">{{ t('athlete.favoritesSubtitle') }}</p>
      </div>
    </section>

    <section>
      <div class="canva-rail gap-2 pb-0">
        <button
          v-for="chip in sportChips"
          :key="chip.value || 'all'"
          type="button"
          class="canva-sport-chip"
          :class="sportFilter === chip.value ? 'canva-sport-chip-active' : 'canva-sport-chip-idle'"
          @click="sportFilter = chip.value"
        >
          {{ chip.label }}
        </button>
      </div>
    </section>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
      <div v-if="!favorited.length" class="space-y-4">
        <CanvaEmptyState
          :title="t('athlete.favoritesEmpty')"
          :body="t('athlete.favoritesEmptyBody')"
          doodle="bench"
        />
        <NuxtLink :to="localePath('/clubs')" class="canva-gate-btn-primary">
          {{ t('athlete.favoritesBrowseClubs') }}
        </NuxtLink>
      </div>
      <div v-else class="space-y-3">
        <article v-for="club in favorited" :key="club.id" class="canva-fav-card">
          <img :src="club.image || '/placeholders/club.svg'" alt="" class="canva-fav-card-media" />
          <div class="canva-fav-card-wash" />
          <div class="canva-fav-card-body">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 text-start">
                <h2 class="truncate text-base font-bold text-brand-primary">{{ localizedField(club, 'nameFa', 'nameEn') }}</h2>
                <p class="mt-0.5 text-xs text-white/85">{{ clubMeta(club) }}</p>
              </div>
              <button
                type="button"
                class="canva-fav-remove"
                :aria-label="t('athlete.removeFavorite')"
                @click="removeFavorite(club.id)"
              >
                <AppIcon name="favorite" size="sm" filled />
              </button>
            </div>
            <p class="mt-3 text-xs leading-5 text-white/90">{{ blurb(club) }}</p>
            <div class="mt-3 flex items-end justify-between gap-3">
              <NuxtLink
                :to="localePath(`/clubs/${club.slug || club.id}`)"
                class="canva-fav-book"
              >
                {{ t('home.bookIt') }}
              </NuxtLink>
              <p class="text-xs font-bold text-white/95">{{ priceLine(club) || t('athlete.favoritesPricePending') }}</p>
            </div>
          </div>
        </article>
      </div>
    </AppAsyncState>
  </div>
</template>
