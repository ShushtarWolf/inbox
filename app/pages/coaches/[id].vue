<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency } = useFormatters()
const id = route.params.id as string

const { data: coach } = await useFetch(`/api/coaches/${id}`)
</script>

<template>
  <div v-if="coach" class="space-y-4">
    <img :src="coach.photo || '/demo/coaches/coach-1.jpg'" alt="" class="mx-auto h-24 w-24 rounded-full object-cover" />
    <div class="text-center">
      <div class="flex items-center justify-center gap-2">
        <h1 class="font-display text-xl font-black">{{ localizedField(coach, 'nameFa', 'nameEn') }}</h1>
        <span v-if="coach.verifiedAt" class="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold text-brand-primary">{{ t('clubs.verified') }}</span>
      </div>
      <p class="text-sm text-brand-gray-600">{{ localizedField(coach, 'headlineFa', 'headlineEn') || localizedField(coach, 'bioFa', 'bioEn') }}</p>
      <p class="mt-1 text-xs text-brand-gray-600">⭐ {{ coach.reviewSummary?.average || coach.rating }} · {{ coach.reviewSummary?.count || 0 }} {{ t('clubs.reviews') }}</p>
    </div>
    <p class="text-center text-sm text-brand-gray-600">{{ localizedField(coach, 'bioFa', 'bioEn') }}</p>
    <p class="text-center text-lg font-black text-brand-primary">{{ formatCurrency(coach.sessionPrice) }}</p>
    <NuxtLink :to="localePath(`/book/coach/${id}`)" class="btn-primary block text-center">{{ t('booking.confirm') }}</NuxtLink>

    <section v-if="coach.specialties?.length" class="ios-card p-4">
      <h2 class="mb-2 font-bold">{{ t('coaches.specialties') }}</h2>
      <div class="flex flex-wrap gap-2">
        <span v-for="item in coach.specialties" :key="item" class="rounded-full border px-3 py-1 text-xs">{{ item }}</span>
      </div>
    </section>

    <section v-if="coach.credentials?.length" class="ios-card p-4">
      <h2 class="mb-2 font-bold">{{ t('coaches.credentials') }}</h2>
      <ul class="space-y-2 text-sm">
        <li v-for="item in coach.credentials" :key="item" class="rounded-xl border px-3 py-2">{{ item }}</li>
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
        <div v-for="item in coach.packages" :key="item.id" class="rounded-xl border p-3">
          <div class="flex items-center justify-between gap-3">
            <p class="font-bold">{{ item.title }}</p>
            <p class="text-sm font-black text-brand-primary">{{ formatCurrency(item.price) }}</p>
          </div>
          <p class="text-xs text-brand-gray-600">{{ item.comment }}</p>
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
        <div v-for="item in coach.testimonials" :key="item.id" class="rounded-xl border p-3">
          <div class="flex items-center justify-between gap-3">
            <p class="font-bold">{{ item.authorName }}</p>
            <p class="text-xs text-brand-gray-600">⭐ {{ item.rating }}</p>
          </div>
          <p class="mt-1 text-sm text-brand-gray-600">{{ item.body }}</p>
        </div>
      </div>
    </section>
  </div>
</template>
