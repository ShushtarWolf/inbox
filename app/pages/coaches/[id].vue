<script setup lang="ts">
import { translateCoachSpecialty } from '#shared/coachSpecialty.ts'
import { weekdayKeyFromDayOfWeek } from '#shared/recurringSessions.ts'

const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency, formatTimeRange, formatNumber } = useFormatters()
const id = route.params.id as string

const { data: coach, pending, error } = await useFetch(`/api/coaches/${id}`)

function specialtyLabel(value: string) {
  return translateCoachSpecialty(t, value)
}

function weekdayLabel(dayOfWeek: number) {
  return t(`owner.weekdays.${weekdayKeyFromDayOfWeek(dayOfWeek)}`)
}

useHead({
  title: () => (coach.value ? localizedField(coach.value, 'nameFa', 'nameEn') : t('coaches.title')),
})
</script>

<template>
  <AppAsyncState :pending="pending" :error="error" :empty="!coach" skeleton-variant="default">
    <div v-if="coach" class="tail-page-stack animate-fade-in">
      <CanvaPublicChrome back-to="/coaches" />

      <section class="canva-panel space-y-4 text-start">
        <div class="flex items-start gap-3">
          <img
            :src="coach.photo || '/placeholders/coach.svg'"
            alt=""
            width="88"
            height="88"
            class="h-22 w-22 shrink-0 border border-brand-gray-100 object-cover shadow-venus-sm"
            style="border-radius: var(--sz-canva-radius); width: 5.5rem; height: 5.5rem;"
          />
          <div class="min-w-0 flex-1">
            <h1 class="text-lg font-bold text-brand-navy">{{ localizedField(coach, 'nameFa', 'nameEn') }}</h1>
            <p
              v-if="localizedField(coach, 'headlineFa', 'headlineEn')"
              class="mt-0.5 text-sm text-brand-gray-600"
            >
              {{ localizedField(coach, 'headlineFa', 'headlineEn') }}
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <span
                v-if="coach.verifiedAt"
                class="canva-chip bg-brand-primary-soft text-brand-primary"
              >
                {{ t('clubs.verified') }}
              </span>
              <p v-if="coach.reviewSummary?.count" class="text-xs text-brand-gray-600">
                ★ {{ formatNumber(coach.reviewSummary?.average || coach.rating) }}
                · {{ formatNumber(coach.reviewSummary?.count) }} {{ t('clubs.reviews') }}
              </p>
              <p v-else class="text-xs text-brand-gray-600">{{ t('coaches.noReviewsYet') }}</p>
            </div>
            <p class="mt-2 text-base font-bold text-brand-primary">{{ formatCurrency(coach.sessionPrice) }}</p>
          </div>
        </div>

        <p v-if="localizedField(coach, 'bioFa', 'bioEn')" class="text-sm leading-relaxed text-brand-gray-600">
          {{ localizedField(coach, 'bioFa', 'bioEn') }}
        </p>

        <NuxtLink
          :to="localePath(`/book/coach/${coach.slug || id}`)"
          class="canva-gate-btn-primary"
        >
          {{ t('home.coachCta') }}
        </NuxtLink>
      </section>

      <section v-if="coach.specialties?.length" class="canva-panel">
        <h2 class="mb-2 font-bold text-brand-navy">{{ t('coaches.specialties') }}</h2>
        <div class="flex flex-wrap justify-start gap-1.5">
          <span
            v-for="item in coach.specialties"
            :key="item"
            class="canva-clubs-chip canva-clubs-chip-idle"
          >
            {{ specialtyLabel(item) }}
          </span>
        </div>
      </section>

      <section v-if="coach.credentials?.length" class="canva-panel">
        <h2 class="mb-2 font-bold text-brand-navy">{{ t('coaches.credentials') }}</h2>
        <ul class="space-y-2 text-sm text-brand-gray-700">
          <li
            v-for="item in coach.credentials"
            :key="item"
            class="border border-brand-gray-100 bg-brand-gray-50 px-3 py-2"
            style="border-radius: var(--sz-canva-radius);"
          >
            {{ item }}
          </li>
        </ul>
      </section>

      <section class="canva-panel">
        <h2 class="mb-2 font-bold text-brand-navy">{{ t('coaches.availability') }}</h2>
        <div v-if="coach.availability?.length" class="overflow-hidden border border-brand-gray-100" style="border-radius: var(--sz-canva-radius);">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-brand-gray-100 bg-brand-gray-50 text-xs text-brand-gray-600">
                <th class="px-3 py-2 text-start font-bold">{{ t('coach.availabilityDay') }}</th>
                <th class="px-3 py-2 text-start font-bold">{{ t('coach.availabilityHours') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in coach.availability"
                :key="item.id"
                class="border-b border-brand-gray-100 last:border-b-0"
              >
                <td class="px-3 py-2 font-medium text-brand-navy">{{ weekdayLabel(item.dayOfWeek) }}</td>
                <td class="px-3 py-2 tabular-nums">
                  <bdi dir="ltr">{{ formatTimeRange(item.startTime, item.endTime) }}</bdi>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="text-xs text-brand-gray-600">{{ t('coach.noAvailability') }}</p>
      </section>

      <section v-if="coach.packages?.length" class="canva-panel space-y-2">
        <h2 class="font-bold text-brand-navy">{{ t('coaches.packages') }}</h2>
        <div
          v-for="item in coach.packages"
          :key="item.id"
          class="border border-brand-gray-100 bg-brand-gray-50 p-3"
          style="border-radius: var(--sz-canva-radius);"
        >
          <div class="flex items-center justify-between gap-3">
            <p class="font-bold text-brand-navy">{{ item.title }}</p>
            <p class="text-sm font-bold text-brand-primary">{{ formatCurrency(item.price) }}</p>
          </div>
          <p class="mt-1 text-xs text-brand-gray-600">{{ item.comment }}</p>
          <NuxtLink
            :to="localePath(`/book/package/${item.id}`)"
            class="mt-2 inline-flex text-sm font-bold text-brand-primary"
          >
            {{ t('booking.packageConfirm') }}
          </NuxtLink>
        </div>
      </section>

      <section v-if="coach.club" class="canva-panel">
        <h2 class="mb-2 font-bold text-brand-navy">{{ t('clubs.title') }}</h2>
        <NuxtLink :to="localePath(`/clubs/${coach.club.slug}`)" class="text-sm font-bold text-brand-primary">
          {{ localizedField(coach.club, 'nameFa', 'nameEn') }}
        </NuxtLink>
      </section>

      <section v-if="coach.testimonials?.length" class="canva-panel space-y-2">
        <h2 class="font-bold text-brand-navy">{{ t('clubs.testimonials') }}</h2>
        <div
          v-for="item in coach.testimonials"
          :key="item.id"
          class="border border-brand-gray-100 bg-brand-gray-50 p-3"
          style="border-radius: var(--sz-canva-radius);"
        >
          <div class="flex items-center justify-between gap-3">
            <p class="font-bold text-brand-navy">{{ item.authorName }}</p>
            <p class="text-xs text-brand-gray-600">★ {{ formatNumber(item.rating) }}</p>
          </div>
          <p class="mt-1 text-sm text-brand-gray-600">{{ item.body }}</p>
        </div>
      </section>
    </div>
  </AppAsyncState>
</template>
