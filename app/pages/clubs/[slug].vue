<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency } = useFormatters()
const slug = route.params.slug as string

const { data: club, pending, error } = await useFetch(`/api/clubs/${slug}`)
</script>

<template>
  <AppAsyncState :pending="pending" :error="error" :empty="!club" skeleton-variant="default">
  <div v-if="club" class="tail-page-stack">
    <PageHeaderNav
      :title="localizedField(club, 'nameFa', 'nameEn')"
      :subtitle="localizedField(club, 'addressFa', 'addressEn')"
      :home-to="localePath('/')"
      :back-to="localePath('/clubs')"
    />
    <img :src="club.image || '/demo/clubs/padel-zone-tehran.jpg'" alt="" class="ios-card -mx-4 aspect-[16/10] w-[calc(100%+2rem)] object-cover" />
    <div class="flex items-center gap-2">
      <span v-if="club.verifiedAt" class="neo-badge">{{ t('clubs.verified') }}</span>
    </div>
    <p class="text-sm text-brand-gray-600">⭐ {{ club.reviewSummary?.average || club.rating }} · {{ club.reviewSummary?.count || 0 }} {{ t('clubs.reviews') }}</p>
    <p class="text-sm">{{ localizedField(club, 'descriptionFa', 'descriptionEn') }}</p>

    <section v-if="club.nextSlots?.length" class="ios-card p-4">
      <h2 class="mb-2 font-bold">{{ t('clubs.freeSlotsToday') }}</h2>
      <div class="flex flex-wrap gap-2">
        <span v-for="s in club.nextSlots" :key="s.id" class="rounded-lg bg-brand-cream px-2 py-1 text-xs font-semibold">
          {{ localizedField(s, 'courtNameFa', 'courtNameEn') }} {{ s.startTime }}
        </span>
      </div>
    </section>

    <NuxtLink :to="localePath(`/book/court/${slug}`)" class="btn-primary block w-full text-center">
      {{ t('home.bookCourt') }}
    </NuxtLink>

    <section v-if="club.amenities?.length" class="ios-card p-4">
      <h2 class="mb-2 font-bold">{{ t('clubs.amenities') }}</h2>
      <div class="flex flex-wrap gap-2">
        <span v-for="item in club.amenities" :key="item" class="neo-pill neo-pill-inactive">{{ item }}</span>
      </div>
    </section>

    <section v-if="club.media?.length" class="ios-card p-4">
      <h2 class="mb-3 font-bold">{{ t('clubs.gallery') }}</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <div v-for="item in club.media" :key="item.id" class="overflow-hidden ios-card">
          <img :src="item.url" alt="" class="aspect-[4/3] w-full object-cover" />
          <p class="p-2 text-xs text-brand-gray-600">{{ localizedField(item, 'captionFa', 'captionEn') }}</p>
        </div>
      </div>
    </section>

    <section v-if="club.pricing?.length" class="ios-card p-4">
      <h2 class="mb-3 font-bold">{{ t('clubs.pricingMatrix') }}</h2>
      <div class="space-y-2 text-sm">
        <div v-for="item in club.pricing" :key="localizedField(item, 'labelFa', 'labelEn')" class="flex items-center justify-between neo-select">
          <span>{{ localizedField(item, 'labelFa', 'labelEn') }}</span>
          <span class="font-bold text-brand-primary">{{ formatCurrency(item.from) }} - {{ formatCurrency(item.to) }}</span>
        </div>
      </div>
    </section>

    <section v-if="club.policies?.length" class="ios-card p-4">
      <h2 class="mb-3 font-bold">{{ t('clubs.policies') }}</h2>
      <div class="space-y-3 text-sm">
        <div v-for="item in club.policies" :key="localizedField(item, 'titleFa', 'titleEn')">
          <p class="font-bold">{{ localizedField(item, 'titleFa', 'titleEn') }}</p>
          <p class="text-brand-gray-600">{{ localizedField(item, 'bodyFa', 'bodyEn') }}</p>
        </div>
      </div>
    </section>

    <section v-if="club.coaches?.length" class="ios-card p-4">
      <h2 class="mb-3 font-bold">{{ t('owner.coaches') }}</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <NuxtLink v-for="coach in club.coaches" :key="coach.id" :to="localePath(`/coaches/${coach.id}`)" class="ios-card p-3">
          <p class="font-bold">{{ localizedField(coach, 'nameFa', 'nameEn') }}</p>
          <p class="text-xs text-brand-gray-600">{{ localizedField(coach, 'headlineFa', 'headlineEn') }}</p>
        </NuxtLink>
      </div>
    </section>

    <section class="ios-card p-4">
      <h2 class="mb-3 font-bold">{{ t('clubs.map') }}</h2>
      <p class="text-sm text-brand-gray-600">{{ localizedField(club, 'addressFa', 'addressEn') }}</p>
      <a
        v-if="club.coordinates"
        class="mt-3 inline-block text-sm font-bold text-brand-primary"
        :href="`https://www.openstreetmap.org/?mlat=${club.coordinates.lat}&mlon=${club.coordinates.lng}#map=15/${club.coordinates.lat}/${club.coordinates.lng}`"
        target="_blank"
        rel="noreferrer"
      >
        {{ t('clubs.openMap') }}
      </a>
    </section>

    <section v-if="club.testimonials?.length" class="ios-card p-4">
      <h2 class="mb-3 font-bold">{{ t('clubs.testimonials') }}</h2>
      <div class="space-y-3">
        <div v-for="item in club.testimonials" :key="item.id" class="ios-card p-3">
          <div class="flex items-center justify-between gap-3">
            <p class="font-bold">{{ item.authorName }}</p>
            <p class="text-xs text-brand-gray-600">⭐ {{ item.rating }}</p>
          </div>
          <p class="mt-1 text-sm text-brand-gray-600">{{ item.body }}</p>
        </div>
      </div>
    </section>
  </div>
  </AppAsyncState>
</template>
