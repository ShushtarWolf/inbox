<script setup lang="ts">
import { PERSIAN_MONTHS, isoToJalaali, jalaaliDaysInMonth, jalaaliToIso } from '#shared/jalali.ts'
import { parseCourtPricingJson } from '#shared/courtPricing.ts'
import { resolveClubSlugAlias } from '#shared/clubSlugAliases.ts'

const route = useRoute()
const localePath = useLocalePath()
const { t, te } = useI18n()
const { localizedField } = useLocalizedField()
const { formatNumber, formatWeekday } = useFormatters()
const { today } = useLocalDate()
const rawSlug = route.params.slug as string
const slug = resolveClubSlugAlias(rawSlug)

if (rawSlug && slug !== rawSlug) {
  await navigateTo(
    { path: localePath(`/clubs/${slug}`), query: route.query },
    { redirectCode: 301, replace: true },
  )
}

const { data: club, pending, error } = await useFetch(`/api/clubs/${slug}`)
const { isFavorite, toggleFavorite } = useClubFavorites()
const favorited = computed(() => (club.value?.id ? isFavorite(club.value.id) : false))
const { user } = useAuth()
const { openLogin } = useAuthFlow()
const { fetchErrorMessage } = useFetchError()

const waitlistSlotId = ref<string | null>(null)
const joiningWaitlist = ref(false)
const waitlistFeedback = ref('')
const waitlistFeedbackTone = ref<'success' | 'error'>('success')
const waitlistEnabled = computed(() => Boolean((club.value as { waitlistEnabled?: boolean } | null)?.waitlistEnabled))

function parseQueryCsv(raw: unknown): string[] {
  if (typeof raw === 'string') {
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
  }
  if (Array.isArray(raw)) {
    return raw.flatMap((v) => (typeof v === 'string' ? v.split(',') : [])).map((s) => s.trim()).filter(Boolean)
  }
  return []
}

/** Deep-link handoff from legacy `/book/court/:slug?date&slot&court` and athlete rebook. */
const deepLinkDate = typeof route.query.date === 'string' && route.query.date ? route.query.date : null
const deepLinkCourt = typeof route.query.court === 'string' && route.query.court ? route.query.court : null
const deepLinkSlotIds = [
  ...parseQueryCsv(route.query.slot),
  ...parseQueryCsv(route.query.slots),
]
const deepLinkTimes = parseQueryCsv(route.query.time).map((t) => t.slice(0, 5))
const deepLinkSlotsPending = ref(deepLinkSlotIds.length > 0 || deepLinkTimes.length > 0)
let suppressSlotClear = deepLinkSlotsPending.value

const gallerySlide = ref(0)
const selectedDate = ref(deepLinkDate || today())
const selectedCourtId = ref<string | null>(deepLinkCourt)
const selectedSlotIds = ref<string[]>([])
const confirmOpen = ref(false)

const { data: slots } = await useFetch('/api/slots/available', {
  query: computed(() => ({
    club: slug,
    date: selectedDate.value,
    includeUnavailable: '1',
  })),
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
  // Empty reviewSummary.average is 0 — do not mask club.rating (Canva shows ~۴.۳).
  const summary = club.value.reviewSummary
  const fromReviews =
    summary && summary.count > 0 && summary.average != null && Number(summary.average) > 0
      ? Number(summary.average)
      : null
  const fallback = club.value.rating != null && Number(club.value.rating) > 0
    ? Number(club.value.rating)
    : null
  const value = fromReviews ?? fallback
  return value != null ? value.toFixed(1) : '—'
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
    if (!list.length) return
    if (!selectedCourtId.value || !list.some((c) => c.id === selectedCourtId.value)) {
      selectedCourtId.value = list[0]!.id
    }
  },
  { immediate: true },
)

watch(selectedDate, () => {
  if (suppressSlotClear) return
  selectedSlotIds.value = []
  waitlistSlotId.value = null
  waitlistFeedback.value = ''
})

watch(selectedCourtId, () => {
  if (suppressSlotClear) return
  selectedSlotIds.value = []
  waitlistSlotId.value = null
  waitlistFeedback.value = ''
})

type ClubSlot = {
  id: string
  startTime: string
  endTime?: string
  price?: number
  displayStatus?: string
  courtId?: string
  court?: { id?: string }
}

const courtSlots = computed(() => {
  const list = (slots.value || []) as ClubSlot[]
  if (!selectedCourtId.value) return list
  return list.filter((s) =>
    s.courtId === selectedCourtId.value || s.court?.id === selectedCourtId.value,
  )
})

watch(
  () => slots.value,
  (list) => {
    if (!deepLinkSlotsPending.value || !list) return
    const available = list as ClubSlot[]
    const isFree = (slot: ClubSlot) => !(slot.displayStatus && slot.displayStatus !== 'FREE')
    let valid = deepLinkSlotIds.filter((id) => {
      const slot = available.find((s) => s.id === id)
      return Boolean(slot && isFree(slot))
    })
    // Rebook fallback: match free slots by clock time when prior slot id is gone.
    if (!valid.length && deepLinkTimes.length) {
      valid = available
        .filter((s) => {
          if (!isFree(s)) return false
          const start = (s.startTime || '').slice(0, 5)
          if (!deepLinkTimes.includes(start)) return false
          if (!selectedCourtId.value) return true
          return s.courtId === selectedCourtId.value || s.court?.id === selectedCourtId.value
        })
        .map((s) => s.id)
    }
    if (valid.length) {
      selectedSlotIds.value = valid
      confirmOpen.value = true
    }
    deepLinkSlotsPending.value = false
    nextTick(() => {
      suppressSlotClear = false
    })
  },
  { immediate: true },
)

function isSlotBooked(slot: ClubSlot) {
  return Boolean(slot.displayStatus && slot.displayStatus !== 'FREE')
}

function isSlotSelected(id: string) {
  return selectedSlotIds.value.includes(id)
}

const selectedSlots = computed(() => {
  return selectedSlotIds.value
    .map((id) => courtSlots.value.find((s) => s.id === id))
    .filter((s): s is ClubSlot => s != null && !isSlotBooked(s))
})

const bookingSummary = computed(() => {
  if (!selectedSlotIds.value.length) return ''
  const picked = selectedSlots.value
  if (!picked.length) return ''
  const times = picked.map((s) => s.startTime).join(' و ')
  const j = isoToJalaali(selectedDate.value)
  const weekday = formatWeekday(selectedDate.value, 'long')
  const dateLabel = `${formatNumber(j.jd)} ${PERSIAN_MONTHS[j.jm - 1]} ${weekday}`
  return t('clubs.bookingSummarySelected', { date: dateLabel, times })
})

const selectedCourtLabel = computed(() => {
  if (!club.value || !selectedCourtId.value) return ''
  const idx = courts.value.findIndex((c) => c.id === selectedCourtId.value)
  if (idx < 0) return ''
  return t('booking.courtNumber', { n: formatNumber(idx + 1) })
})

const sportLabel = computed(() => {
  const court = courts.value.find((c) => c.id === selectedCourtId.value) || courts.value[0]
  const sportKey = (court as { sport?: { slug?: string } } | undefined)?.sport?.slug
  if (sportKey === 'padel') return t('clubs.sportCourtPadel')
  if (sportKey === 'tennis') return t('clubs.sportCourtTennis')
  return t('clubs.sportCourtGeneric')
})

const rentalEquipment = computed(() => {
  const list = (club.value as { equipment?: Array<{ id: string; nameFa: string; nameEn: string; price: number }> } | null)?.equipment || []
  if (!list.length) return null
  const racket = list.find((e) => /راکت|racket/i.test(`${e.nameFa} ${e.nameEn}`))
  return racket || list[0] || null
})

/** Canva (3): rate footnotes under slot grid — only from real pricing, never invent a second band. */
function toThousand(value: number) {
  return formatNumber(Math.round(value / 1000))
}

const selectedCourt = computed(() => {
  if (!selectedCourtId.value) return courts.value[0]
  return courts.value.find((c) => c.id === selectedCourtId.value) || courts.value[0]
})

const pricingFootnotes = computed(() => {
  if (!club.value) return [] as string[]
  const notes: string[] = []
  const court = selectedCourt.value as { price?: number; pricingJson?: string | null } | undefined
  const bands = court ? (parseCourtPricingJson(court.pricingJson).timeBands || []) : []
  const distinctBandPrices = [...new Set(bands.map((b) => b.price))]

  if (bands.length >= 2 && distinctBandPrices.length >= 2) {
    const labeledBands = bands
      .map((band) => {
        const label = localizedField(band, 'labelFa', 'labelEn') || band.labelFa || band.labelEn
        return label ? { label, price: band.price } : null
      })
      .filter((row): row is { label: string; price: number } => row != null)
    if (labeledBands.length >= 2 && new Set(labeledBands.map((b) => b.price)).size >= 2) {
      for (const row of labeledBands) {
        notes.push(t('clubs.sessionRateBand', { label: row.label, price: toThousand(row.price) }))
      }
    } else {
      notes.push(t('clubs.sessionRateRangeNote', {
        from: toThousand(Math.min(...distinctBandPrices)),
        to: toThousand(Math.max(...distinctBandPrices)),
      }))
    }
  } else if (bands.length === 1 && bands[0]) {
    notes.push(t('clubs.sessionRateSingle', { price: toThousand(bands[0].price) }))
  } else {
    const clubPricing = (club.value.pricing || []) as Array<{
      labelFa?: string
      labelEn?: string
      from?: number
      to?: number
      price?: number
    }>
    const labeled = clubPricing
      .map((row) => {
        const label = localizedField(row, 'labelFa', 'labelEn') || row.labelFa || row.labelEn
        const price = typeof row.price === 'number'
          ? row.price
          : typeof row.from === 'number'
            ? row.from
            : null
        return label && price != null ? { label, price } : null
      })
      .filter((row): row is { label: string; price: number } => row != null)
    const distinctLabeled = [...new Set(labeled.map((row) => row.price))]

    if (labeled.length >= 2 && distinctLabeled.length >= 2) {
      for (const row of labeled) {
        notes.push(t('clubs.sessionRateBand', { label: row.label, price: toThousand(row.price) }))
      }
    } else {
      const slotPrices = [
        ...new Set(
          courtSlots.value
            .map((s) => s.price)
            .filter((p): p is number => typeof p === 'number' && p >= 0),
        ),
      ]
      if (slotPrices.length === 1) {
        notes.push(t('clubs.sessionRateSingle', { price: toThousand(slotPrices[0]!) }))
      } else if (slotPrices.length >= 2) {
        notes.push(t('clubs.sessionRateRangeNote', {
          from: toThousand(Math.min(...slotPrices)),
          to: toThousand(Math.max(...slotPrices)),
        }))
      } else {
        const price = court?.price ?? club.value.priceFrom
        const priceTo = club.value.priceTo
        if (price != null && priceTo != null && priceTo !== price) {
          notes.push(t('clubs.sessionRateRangeNote', {
            from: toThousand(price),
            to: toThousand(priceTo),
          }))
        } else if (price != null) {
          notes.push(t('clubs.sessionRateSingle', { price: toThousand(price) }))
        }
      }
    }
  }

  const minutes = (club.value as { defaultSessionDurationMinutes?: number }).defaultSessionDurationMinutes ?? 60
  notes.push(t('clubs.sessionDurationNote', { minutes: formatNumber(minutes) }))
  return notes
})

function openConfirmSheet() {
  if (!selectedSlotIds.value.length) return
  waitlistSlotId.value = null
  confirmOpen.value = true
}

function onConfirmSuccess() {
  selectedSlotIds.value = []
  waitlistSlotId.value = null
}
const mapEmbedSrc = computed(() => {
  const coords = club.value?.coordinates
  if (!coords) return ''
  const { lat, lng } = coords
  const pad = 0.012
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - pad}%2C${lat - pad}%2C${lng + pad}%2C${lat + pad}&layer=mapnik&marker=${lat}%2C${lng}`
})

const osmLink = computed(() => {
  const coords = club.value?.coordinates
  if (coords) {
    return `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=16/${coords.lat}/${coords.lng}`
  }
  const address = club.value
    ? localizedField(club.value, 'addressFa', 'addressEn') || club.value.city
    : ''
  if (!address) return ''
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`
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

const monthLabel = computed(() => {
  const year = new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(viewYear.value)
  return `${PERSIAN_MONTHS[viewMonth.value - 1]} ${year}`
})

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

function toggleSlot(slot: ClubSlot) {
  if (isSlotBooked(slot)) {
    if (!waitlistEnabled.value) return
    selectedSlotIds.value = []
    waitlistFeedback.value = ''
    waitlistSlotId.value = waitlistSlotId.value === slot.id ? null : slot.id
    return
  }
  waitlistSlotId.value = null
  waitlistFeedback.value = ''
  if (selectedSlotIds.value.includes(slot.id)) {
    selectedSlotIds.value = selectedSlotIds.value.filter((x) => x !== slot.id)
    return
  }
  selectedSlotIds.value = [...selectedSlotIds.value, slot.id]
}

async function joinCourtWaitlist() {
  const slot = courtSlots.value.find((s) => s.id === waitlistSlotId.value)
  if (!slot || !club.value) return
  if (!user.value) {
    openLogin({
      returnTo: route.fullPath,
      notice: t('booking.loginToConfirmNotice'),
    })
    return
  }
  joiningWaitlist.value = true
  waitlistFeedback.value = ''
  try {
    await $fetch('/api/waitlist', {
      method: 'POST',
      body: {
        clubSlug: slug,
        courtId: selectedCourtId.value || slot.courtId || slot.court?.id,
        date: selectedDate.value,
        startTime: slot.startTime,
        endTime: slot.endTime || slot.startTime,
        guestName: user.value.name,
        guestMobile: user.value.phone,
      },
    })
    waitlistFeedbackTone.value = 'success'
    waitlistFeedback.value = t('booking.waitlistJoined')
    waitlistSlotId.value = null
  }
  catch (err: unknown) {
    waitlistFeedbackTone.value = 'error'
    waitlistFeedback.value = fetchErrorMessage(err, t('booking.actionFailed'))
  }
  finally {
    joiningWaitlist.value = false
  }
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
  <div v-if="pending" class="tail-page-enter">
    <AppVenusSkeleton :lines="4" />
  </div>
  <div v-else-if="error || !club" class="space-y-4">
    <CanvaPublicChrome back-to="/clubs" />
    <div class="canva-result-sheet mx-auto max-w-sm space-y-4 p-6 text-center">
      <p class="text-lg font-bold text-brand-navy">{{ t('clubs.notFoundTitle') }}</p>
      <p class="text-sm text-brand-gray-600">{{ t('clubs.notFoundBody') }}</p>
      <NuxtLink :to="localePath('/clubs')" class="canva-cta inline-flex w-full justify-center">
        {{ t('clubs.notFoundCta') }}
      </NuxtLink>
    </div>
  </div>
  <div v-else-if="club" class="tail-page-enter">
    <div class="canva-club-detail space-y-3">
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
              <span v-if="locationLine" class="text-brand-gray-300">|</span>
              <span>{{ sportLabel }}</span>
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

        <!-- 4. Booking widget: legend + courts + calendar/slots + square CTA -->
        <section class="canva-club-detail-section">
          <h2 class="canva-club-detail-section-title">{{ t('clubs.selectDateTime') }}</h2>

          <div class="canva-club-slot-legend" role="list">
            <span class="canva-club-legend-item" role="listitem">
              <span class="canva-club-legend-swatch canva-club-legend-booked" aria-hidden="true" />
              {{ t('clubs.slotLegendBooked') }}
            </span>
            <span class="canva-club-legend-item" role="listitem">
              <span class="canva-club-legend-swatch canva-club-legend-selected" aria-hidden="true" />
              {{ t('clubs.slotLegendSelected') }}
            </span>
            <span class="canva-club-legend-item" role="listitem">
              <span class="canva-club-legend-swatch canva-club-legend-free" aria-hidden="true" />
              {{ t('clubs.slotLegendFree') }}
            </span>
          </div>

          <!-- Canva (3): calendar RIGHT · court nums + slots LEFT -->
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
              <div class="canva-clubs-chip-row mb-2 flex-wrap">
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
                  :class="{
                    'canva-club-slot-booked': isSlotBooked(slot) && waitlistSlotId !== slot.id,
                    'canva-club-slot-active': isSlotSelected(slot.id) || waitlistSlotId === slot.id,
                  }"
                  :disabled="isSlotBooked(slot) && !waitlistEnabled"
                  @click="toggleSlot(slot)"
                >
                  {{ slot.startTime }}
                </button>
                <p v-if="!courtSlots.length" class="canva-club-detail-desc col-span-full">
                  {{ t('common.empty') }}
                </p>
              </div>
              <p
                v-if="waitlistEnabled && courtSlots.some((s) => isSlotBooked(s))"
                class="mt-2 text-[11px] leading-snug text-brand-gray-600"
              >
                {{ t('booking.waitlistHint') }}
              </p>
              <ul v-if="pricingFootnotes.length" class="mt-2 space-y-0.5 text-[11px] leading-snug text-brand-gray-600">
                <li v-for="(note, idx) in pricingFootnotes" :key="idx">{{ note }}</li>
              </ul>
            </div>
          </div>

          <div class="canva-club-book-footer">
            <p
              v-if="waitlistFeedback"
              class="canva-club-book-summary"
              :class="waitlistFeedbackTone === 'success' ? 'text-brand-primary' : 'text-red-600'"
            >
              {{ waitlistFeedback }}
            </p>
            <p v-else-if="waitlistSlotId" class="canva-club-book-summary">{{ t('booking.waitlistSelectedHint') }}</p>
            <p v-else-if="bookingSummary" class="canva-club-book-summary">{{ bookingSummary }}</p>
            <p v-else class="canva-club-book-summary text-brand-gray-600">{{ t('clubs.selectSlotToContinue') }}</p>
            <button
              v-if="waitlistSlotId"
              type="button"
              class="canva-cta canva-club-book-cta"
              :disabled="joiningWaitlist"
              @click="joinCourtWaitlist"
            >
              {{ joiningWaitlist ? t('common.loading') : t('booking.joinWaitlist') }}
            </button>
            <button
              v-else
              type="button"
              class="canva-cta canva-club-book-cta"
              :disabled="!selectedSlotIds.length"
              @click="openConfirmSheet"
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
              <a
                v-else-if="osmLink"
                class="canva-club-more-map-empty canva-club-more-map-cta"
                :href="osmLink"
                target="_blank"
                rel="noreferrer"
              >
                {{ t('clubs.openMap') }}
              </a>
              <div v-else class="canva-club-more-map-empty">{{ t('clubs.mapUnavailable') }}</div>
              <a
                v-if="osmLink && mapEmbedSrc"
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

      <CourtBookingConfirmSheet
        :open="confirmOpen"
        :club-id="club.id"
        :club-name="localizedField(club, 'nameFa', 'nameEn')"
        :location-line="locationLine"
        :sport-label="sportLabel"
        :rating-display="ratingDisplay"
        :date="selectedDate"
        :court-id="selectedCourtId || undefined"
        :court-label="selectedCourtLabel"
        :slots="selectedSlots"
        :rental-equipment="rentalEquipment"
        @close="confirmOpen = false"
        @success="onConfirmSuccess"
      />
    </div>
  </div>
</template>
