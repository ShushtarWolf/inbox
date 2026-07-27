<script setup lang="ts">
import { PERSIAN_MONTHS, isoToJalaali, jalaaliDaysInMonth, jalaaliToIso } from '#shared/jalali.ts'

const route = useRoute()
const { t, te } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency, formatNumber } = useFormatters()
const { today } = useLocalDate()
const slug = route.params.slug as string

const { data: club, pending, error } = await useFetch(`/api/clubs/${slug}`)
const { isFavorite, toggleFavorite } = useClubFavorites()
const favorited = computed(() => (club.value?.id ? isFavorite(club.value.id) : false))

const gallerySlide = ref(0)
const selectedDate = ref(today())
const selectedCourtId = ref<string | null>(null)
const selectedSlotIds = ref<string[]>([])

const { data: slots } = await useFetch('/api/slots/available', {
  query: computed(() => ({ club: slug, date: selectedDate.value })),
})

const gallerySlides = computed(() => {
  if (!club.value) return [] as string[]
  const urls = [
    club.value.image,
    ...(club.value.media || []).map((m) => m.url),
  ].filter((u): u is string => Boolean(u))
  return urls.length ? [...new Set(urls)] : ['/placeholders/club.svg']
})

const activeGallery = computed(() => gallerySlides.value[gallerySlide.value] || gallerySlides.value[0])

const ratingDisplay = computed(() => {
  if (!club.value) return '—'
  const value = club.value.reviewSummary?.average ?? club.value.rating
  return value != null ? Number(value).toFixed(1) : '—'
})

const locationLine = computed(() => {
  if (!club.value) return ''
  const parts = [club.value.city, club.value.district].filter(Boolean)
  return parts.join('، ') || club.value.city || ''
})

const courts = computed(() => club.value?.courts || [])

watch(
  courts,
  (list) => {
    if (!list.length) {
      selectedCourtId.value = null
      return
    }
    if (!selectedCourtId.value || !list.some((c) => c.id === selectedCourtId.value)) {
      selectedCourtId.value = list[0]!.id
    }
  },
  { immediate: true },
)

watch(selectedDate, () => {
  selectedSlotIds.value = []
})

watch(selectedCourtId, () => {
  selectedSlotIds.value = []
})

const courtSlots = computed(() => {
  const list = slots.value || []
  if (!selectedCourtId.value) return list
  return list.filter((s: { courtId?: string; court?: { id?: string } }) =>
    s.courtId === selectedCourtId.value || s.court?.id === selectedCourtId.value,
  )
})

const bookingSummary = computed(() => {
  if (!selectedSlotIds.value.length) return ''
  const picked = courtSlots.value.filter((s: { id: string }) => selectedSlotIds.value.includes(s.id))
  if (!picked.length) return ''
  const times = picked.map((s: { startTime: string }) => s.startTime).join('، ')
  const j = isoToJalaali(selectedDate.value)
  const dateLabel = `${formatNumber(j.jd)} ${PERSIAN_MONTHS[j.jm - 1]}`
  return t('clubs.bookingSummary', { date: dateLabel, times })
})

const continueTo = computed(() => {
  const slot = selectedSlotIds.value[0]
  return localePath({
    path: `/book/court/${slug}`,
    query: {
      date: selectedDate.value || undefined,
      slot: slot || undefined,
      court: selectedCourtId.value || undefined,
    },
  })
})

const mapEmbedSrc = computed(() => {
  const coords = club.value?.coordinates
  if (!coords) return ''
  const { lat, lng } = coords
  const pad = 0.012
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - pad}%2C${lat - pad}%2C${lng + pad}%2C${lat + pad}&layer=mapnik&marker=${lat}%2C${lng}`
})

const osmLink = computed(() => {
  const coords = club.value?.coordinates
  if (!coords) return ''
  return `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=16/${coords.lat}/${coords.lng}`
})

/* ── Gallery ── */
function nextGallery() {
  gallerySlide.value = (gallerySlide.value + 1) % gallerySlides.value.length
}
function prevGallery() {
  gallerySlide.value = (gallerySlide.value - 1 + gallerySlides.value.length) % gallerySlides.value.length
}

/* ── Calendar (sharp, clubs-detail only) ── */
const viewYear = ref(1404)
const viewMonth = ref(1)
const PERSIAN_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const

function syncCalFromDate() {
  const j = isoToJalaali(selectedDate.value || today())
  viewYear.value = j.jy
  viewMonth.value = j.jm
}
watch(selectedDate, syncCalFromDate, { immediate: true })

const monthLabel = computed(() => `${PERSIAN_MONTHS[viewMonth.value - 1]} ${formatNumber(viewYear.value)}`)

const calendarCells = computed(() => {
  const daysInMonth = jalaaliDaysInMonth(viewYear.value, viewMonth.value)
  const [gy, gm, gd] = jalaaliToIso(viewYear.value, viewMonth.value, 1).split('-').map(Number)
  const weekday = new Date(gy!, gm! - 1, gd!).getDay()
  const leadingBlanks = (weekday + 1) % 7
  const cells: Array<{ day: number | null; iso: string | null }> = []
  for (let i = 0; i < leadingBlanks; i++) cells.push({ day: null, iso: null })
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, iso: jalaaliToIso(viewYear.value, viewMonth.value, day) })
  }
  return cells
})

function prevMonth() {
  if (viewMonth.value === 1) {
    viewMonth.value = 12
    viewYear.value -= 1
    return
  }
  viewMonth.value -= 1
}
function nextMonth() {
  if (viewMonth.value === 12) {
    viewMonth.value = 1
    viewYear.value += 1
    return
  }
  viewMonth.value += 1
}

function selectDay(iso: string) {
  if (iso < today()) return
  selectedDate.value = iso
}

function toggleSlot(id: string) {
  if (selectedSlotIds.value.includes(id)) {
    selectedSlotIds.value = selectedSlotIds.value.filter((x) => x !== id)
    return
  }
  selectedSlotIds.value = [...selectedSlotIds.value, id]
}

function amenityLabel(item: string) {
  const key = `clubs.amenityOptions.${item}`
  return te(key) ? t(key) : item
}

async function shareClub() {
  if (!import.meta.client || !club.value) return
  const url = window.location.href
  const title = localizedField(club.value, 'nameFa', 'nameEn')
  try {
    if (navigator.share) {
      await navigator.share({ title, url })
      return
    }
  } catch {
    // fall through to clipboard
  }
  try {
    await navigator.clipboard.writeText(url)
  } catch {
    // ignore
  }
}
</script>

<template>
  <AppAsyncState :pending="pending" :error="error" :empty="!club" skeleton-variant="default">
    <div v-if="club" class="canva-club-detail space-y-3">
      <CanvaPublicChrome back-to="/clubs" />
      <!-- 1. Gallery: full-bleed, arrows, red active dots -->
      <section class="canva-club-gallery">
        <img :src="activeGallery" alt="" class="canva-club-gallery-media" />
        <button type="button" class="canva-club-gallery-arrow canva-club-gallery-arrow-start" :aria-label="t('calendar.prevMonth')" @click="prevGallery">
          <AppIcon name="chevron_right" size="md" />
        </button>
        <button type="button" class="canva-club-gallery-arrow canva-club-gallery-arrow-end" :aria-label="t('calendar.nextMonth')" @click="nextGallery">
          <AppIcon name="chevron_left" size="md" />
        </button>
        <div class="canva-club-gallery-dots">
          <button
            v-for="(_, index) in gallerySlides"
            :key="index"
            type="button"
            class="canva-hero-dot"
            :class="index === gallerySlide ? 'canva-hero-dot-active' : 'canva-hero-dot-idle'"
            :aria-label="t('common.carouselSlide', { current: index + 1, total: gallerySlides.length })"
            :aria-current="index === gallerySlide ? 'true' : undefined"
            @click="gallerySlide = index"
          />
        </div>
      </section>

      <div class="canva-club-detail-body">
        <!-- 2. Title RIGHT + favorite/share LEFT · meta · description -->
        <header class="canva-club-detail-head">
          <div class="canva-club-detail-head-copy">
            <h1 class="canva-club-detail-name">{{ localizedField(club, 'nameFa', 'nameEn') }}</h1>
            <p class="canva-club-detail-rating-line">
              <span v-if="locationLine">{{ locationLine }}</span>
              <span v-if="locationLine" class="text-brand-gray-300">·</span>
              <span class="canva-court-card-rating !mt-0 text-brand-navy">
                {{ ratingDisplay }}
                <span class="canva-court-card-star" aria-hidden="true">★</span>
              </span>
            </p>
          </div>
          <div class="canva-club-detail-icon-actions">
            <button
              type="button"
              class="canva-club-detail-icon-btn"
              :aria-label="favorited ? t('athlete.removeFavorite') : t('athlete.addFavorite')"
              @click="toggleFavorite(club.id)"
            >
              <AppIcon name="favorite" size="md" :filled="favorited" />
            </button>
            <button type="button" class="canva-club-detail-icon-btn" :aria-label="t('clubs.share')" @click="shareClub">
              <AppIcon name="share" size="md" />
            </button>
          </div>
        </header>

        <p
          v-if="localizedField(club, 'descriptionFa', 'descriptionEn')"
          class="canva-club-detail-desc"
        >
          {{ localizedField(club, 'descriptionFa', 'descriptionEn') }}
        </p>

        <!-- 3. Amenities — rectangular chips, right-grouped -->
        <section v-if="club.amenities?.length" class="canva-club-detail-section">
          <h2 class="canva-club-detail-section-title">{{ t('clubs.amenities') }}</h2>
          <div class="canva-clubs-chip-row flex-wrap">
            <span
              v-for="item in club.amenities"
              :key="item"
              class="canva-chip canva-clubs-chip-idle"
            >{{ amenityLabel(item) }}</span>
          </div>
        </section>

        <!-- 4. Booking widget: calendar + courts + slots + square CTA -->
        <section class="canva-club-detail-section">
          <h2 class="canva-club-detail-section-title">{{ t('clubs.selectDateTime') }}</h2>
          <div class="canva-club-book">
            <div class="canva-club-book-cal">
              <div class="canva-club-cal-nav">
                <button type="button" class="canva-club-cal-nav-btn" :aria-label="t('calendar.prevMonth')" @click="prevMonth">
                  <AppIcon name="chevron_right" size="sm" />
                </button>
                <p class="canva-club-cal-month">{{ monthLabel }}</p>
                <button type="button" class="canva-club-cal-nav-btn" :aria-label="t('calendar.nextMonth')" @click="nextMonth">
                  <AppIcon name="chevron_left" size="sm" />
                </button>
              </div>
              <div class="canva-club-cal-weekdays">
                <span v-for="wd in PERSIAN_WEEKDAYS" :key="wd">{{ wd }}</span>
              </div>
              <div class="canva-club-cal-grid">
                <template v-for="(cell, index) in calendarCells" :key="index">
                  <button
                    v-if="cell.day && cell.iso"
                    type="button"
                    class="canva-club-cal-day"
                    :class="{
                      'canva-club-cal-day-active': cell.iso === selectedDate,
                      'canva-club-cal-day-disabled': cell.iso < today(),
                    }"
                    :disabled="cell.iso < today()"
                    @click="selectDay(cell.iso!)"
                  >
                    {{ formatNumber(cell.day) }}
                  </button>
                  <span v-else class="canva-club-cal-day canva-club-cal-day-empty" />
                </template>
              </div>
            </div>

            <div class="canva-club-book-slots">
              <p class="canva-club-book-slots-label">{{ t('clubs.selectCourt') }}</p>
              <div class="canva-clubs-chip-row flex-wrap">
                <button
                  v-for="(court, idx) in courts"
                  :key="court.id"
                  type="button"
                  class="canva-club-court-num"
                  :class="selectedCourtId === court.id ? 'canva-club-court-num-active' : ''"
                  @click="selectedCourtId = court.id"
                >
                  {{ formatNumber(idx + 1) }}
                </button>
              </div>

              <div class="canva-club-slot-grid">
                <button
                  v-for="slot in courtSlots"
                  :key="slot.id"
                  type="button"
                  class="canva-club-slot"
                  :class="selectedSlotIds.includes(slot.id) ? 'canva-club-slot-active' : ''"
                  @click="toggleSlot(slot.id)"
                >
                  {{ slot.startTime }}
                </button>
                <p v-if="!courtSlots.length" class="canva-club-detail-desc col-span-full">
                  {{ t('common.empty') }}
                </p>
              </div>
            </div>
          </div>

          <div class="canva-club-book-footer">
            <p v-if="bookingSummary" class="canva-club-book-summary">{{ bookingSummary }}</p>
            <p v-else class="canva-club-book-summary text-brand-gray-600">{{ t('clubs.selectSlotToContinue') }}</p>
            <NuxtLink
              v-if="selectedSlotIds.length"
              :to="continueTo"
              class="canva-cta canva-club-detail-cta"
            >
              {{ t('auth.continueConfirm') }}
            </NuxtLink>
            <button
              v-else
              type="button"
              class="canva-cta canva-club-detail-cta opacity-50"
              disabled
            >
              {{ t('auth.continueConfirm') }}
            </button>
          </div>
        </section>

        <!-- 5. More info: address/contact RIGHT, map LEFT -->
        <section class="canva-club-detail-section">
          <h2 class="canva-club-detail-section-title">{{ t('clubs.moreInfo') }}</h2>
          <div class="canva-club-more">
            <div class="canva-club-more-copy">
              <div>
                <p class="canva-club-more-label">{{ t('clubs.addressLabel') }}</p>
                <p class="canva-club-more-value">{{ localizedField(club, 'addressFa', 'addressEn') }}</p>
              </div>
              <div v-if="club.phone">
                <p class="canva-club-more-label">{{ t('clubs.contactLabel') }}</p>
                <a class="canva-club-more-value canva-club-detail-link" dir="ltr" :href="`tel:${club.phone}`">{{ club.phone }}</a>
              </div>
            </div>
            <div class="canva-club-more-map">
              <iframe
                v-if="mapEmbedSrc"
                :src="mapEmbedSrc"
                title="map"
                class="canva-club-more-map-frame"
                loading="lazy"
                referrerpolicy="no-referrer-when-downgrade"
              />
              <div v-else class="canva-club-more-map-empty">{{ t('clubs.map') }}</div>
              <a
                v-if="osmLink"
                class="canva-club-detail-link mt-2"
                :href="osmLink"
                target="_blank"
                rel="noreferrer"
              >{{ t('clubs.openMap') }}</a>
            </div>
          </div>
        </section>

        <!-- 6. Reviews — always present (empty box like Canva) -->
        <section class="canva-club-detail-section">
          <h2 class="canva-club-detail-section-title">{{ t('clubs.athleteReviews') }}</h2>
          <div v-if="club.testimonials?.length" class="canva-club-reviews">
            <article v-for="item in club.testimonials" :key="item.id" class="canva-club-review">
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-bold text-brand-navy">{{ item.authorName }}</p>
                <p class="canva-court-card-rating !mt-0 text-brand-navy">
                  <span class="canva-court-card-star" aria-hidden="true">★</span>
                  {{ item.rating }}
                </p>
              </div>
              <p class="mt-1 text-sm text-brand-gray-600">{{ item.body }}</p>
            </article>
          </div>
          <div v-else class="canva-club-reviews-empty">
            {{ t('clubs.reviewsEmpty') }}
          </div>
        </section>
      </div>
    </div>
  </AppAsyncState>
</template>
