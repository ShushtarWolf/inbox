<script setup lang="ts">
import { translateCoachSpecialty } from '#shared/coachSpecialty.ts'

const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency } = useFormatters()
const id = route.params.id as string

const { data: coach, pending, error } = await useFetch(`/api/coaches/${id}`)

function specialtyLabel(value: string) {
  return translateCoachSpecialty(t, value)
}
</script>

<template>
  <AppAsyncState :pending="pending" :error="error" :empty="!coach" skeleton-variant="default">
  <div v-if="coach" class="tail-page-stack">
    <PageHeaderNav
      :title="localizedField(coach, 'nameFa', 'nameEn')"
      :subtitle="localizedField(coach, 'headlineFa', 'headlineEn') || localizedField(coach, 'bioFa', 'bioEn')"
      :home-to="localePath('/')"
      :back-to="localePath('/coaches')"
    />
    <img :src="coach.photo || '/placeholders/coach.svg'" alt="" class="mx-auto h-24 w-24 border border-brand-gray-100 object-cover shadow-venus-sm" />
    <div class="text-center">
      <div class="flex items-center justify-center gap-2">
        <span v-if="coach.verifiedAt" class="neo-badge">{{ t('clubs.verified') }}</span>
      </div>
      <p v-if="coach.reviewSummary?.count" class="mt-1 text-xs text-brand-gray-600">⭐ {{ coach.reviewSummary?.average || coach.rating }} · {{ coach.reviewSummary?.count }} {{ t('clubs.reviews') }}</p>
      <p v-else class="mt-1 text-xs text-brand-gray-600">{{ t('coaches.noReviewsYet') }}</p>
    </div>
    <p class="text-center text-sm text-brand-gray-600">{{ localizedField(coach, 'bioFa', 'bioEn') }}</p>
    <p class="text-center text-lg font-bold text-brand-primary">{{ formatCurrency(coach.sessionPrice) }}</p>
    <NuxtLink :to="localePath(`/book/coach/${coach.slug || id}`)" class="btn-primary block text-center">{{ t('home.coachCta') }}</NuxtLink>

    <section v-if="coach.specialties?.length" class="ios-card p-4">
      <h2 class="mb-2 font-bold">{{ t('coaches.specialties') }}</h2>
      <div class="flex flex-wrap gap-2">
        <span v-for="item in coach.specialties" :key="item" class="neo-pill neo-pill-inactive">{{ specialtyLabel(item) }}</span>
      </div>
    </section>

    <section v-if="coach.credentials?.length" class="ios-card p-4">
      <h2 class="mb-2 font-bold">{{ t('coaches.credentials') }}</h2>
      <ul class="space-y-2 text-sm">
        <li v-for="item in coach.credentials" :key="item" class="neo-select">{{ item }}</li>
      </ul>
    </section>

    <section class="ios-card p-4">
      <h2 class="mb-2 font-bold">{{ t('coaches.availability') }}</h2>
      <div class="flex flex-wrap gap-2 text-xs">
        <span v-for="item in coach.availability" :key="item.id" class="rounded-full border px-3 py-1">
          {{ t('coach.dayLabel', { day: item.dayOfWeek }) }} · {{ item.startTime }} - {{ item.endTime }}
        </span>
      </div>
    </section>

    <section v-if="coach.packages?.length" class="ios-card p-4">
      <h2 class="mb-2 font-bold">{{ t('coaches.packages') }}</h2>
      <div class="space-y-2">
        <div v-for="item in coach.packages" :key="item.id" class="ios-card p-3">
          <div class="flex items-center justify-between gap-3">
            <p class="font-bold">{{ item.title }}</p>
            <p class="text-sm font-bold text-brand-primary">{{ formatCurrency(item.price) }}</p>
          </div>
          <p class="text-xs text-brand-gray-600">{{ item.comment }}</p>
          <NuxtLink :to="localePath(`/book/package/${item.id}`)" class="mt-2 inline-block text-sm font-bold text-brand-primary">
            {{ t('booking.packageConfirm') }}
          </NuxtLink>
        </div>
      </div>
    </section>

    <section v-if="coach.club" class="ios-card p-4">
      <h2 class="mb-2 font-bold">{{ t('clubs.title') }}</h2>
      <NuxtLink :to="localePath(`/clubs/${coach.club.slug}`)" class="text-sm font-bold text-brand-primary">
        {{ localizedField(coach.club, 'nameFa', 'nameEn') }}
      </NuxtLink>
    </section>

    <section v-if="coach.testimonials?.length" class="ios-card p-4">
      <h2 class="mb-2 font-bold">{{ t('clubs.testimonials') }}</h2>
      <div class="space-y-2">
        <div v-for="item in coach.testimonials" :key="item.id" class="ios-card p-3">
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
