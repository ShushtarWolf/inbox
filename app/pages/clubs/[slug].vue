<script setup lang="ts">
import { PERSIAN_MONTHS, isoToJalaali, jalaaliDaysInMonth, jalaaliToIso } from '#shared/jalali.ts'
import { parseCourtPricingJson } from '#shared/courtPricing.ts'
import { resolveClubSlugAlias } from '#shared/clubSlugAliases.ts'
import {
  courtIdsFromSlots,
  isSlotFree,
  joinWithAnd,
  resolveBasketSlots,
  slotCourtId,
  sortSlotsByTimeThenCourt,
  timesFromSlots,
  removeSlotsForCourt,
  toggleHourOnCourts,
  uniqueOrdered,
  upsertBasketSlots,
} from '#shared/courtSlotSelection.ts'
import { courtDisplayNumber, sortCourtsByOrdinal } from '#shared/courtDisplay.ts'
import { buildClubSportsActivityLocationJsonLd } from '#shared/clubJsonLd.ts'
import {
  buildClubCitationCopy,
  buildClubFaqPageJsonLd,
  clubCitationFaqHeading,
} from '#shared/clubCitationCopy.ts'
import { serializeJsonLd } from '#shared/jsonLd.ts'
import { buildReturnTo } from '#shared/returnTo.ts'

type ClubSlot = {
  id: string
  date?: string
  startTime: string
  endTime?: string
  price?: number
  displayStatus?: string
  courtId?: string
  court?: { id?: string }
}

type ClubCourt = {
  id: string
  nameFa: string
  nameEn?: string
  price?: number
  pricingJson?: string | null
  sport?: { slug?: string }
}

type ClubDetail = {
  id: string
  image?: string | null
  media?: Array<{ url: string }>
  reviewSummary?: { count: number; average: number | null }
  city?: string
  district?: string
  courts?: ClubCourt[]
  waitlistEnabled?: boolean
  equipment?: Array<{ id: string; nameFa: string; nameEn: string; price: number; quantity?: number; category?: string }>
  pricing?: Array<{ labelFa?: string; labelEn?: string; from?: number; to?: number; price?: number }>
  priceFrom?: number | null
  priceTo?: number | null
  defaultSessionDurationMinutes?: number
  coordinates?: { lat: number; lng: number } | null
  addressFa?: string
  addressEn?: string
  nameFa?: string
  nameEn?: string
  descriptionFa?: string
  descriptionEn?: string
  amenities?: string[]
  phone?: string
  openHour?: number | null
  closeHour?: number | null
  testimonials?: Array<{ id: string; authorName: string; rating: number; body: string }>
}

const route = useRoute()
const localePath = useLocalePath()
const config = useRuntimeConfig()
const { t, te } = useI18n()
const { localizedField } = useLocalizedField()
const { formatNumber, formatYear, formatWeekday, formatTimeLabel, formatPhone } = useFormatters()
const { today } = useLocalDate()
const rawSlug = route.params.slug as string
const slug = resolveClubSlugAlias(rawSlug)

if (rawSlug && slug !== rawSlug) {
  await navigateTo(
    { path: localePath(`/clubs/${slug}`), query: route.query },
    { redirectCode: 301, replace: true },
  )
}

const { data: club, pending, error } = await useFetch<ClubDetail>(`/api/clubs/${slug}`)
const showClubPending = useHeldPending(pending, { forceRelease: () => Boolean(error.value) })
const { isFavorite, toggleFavorite } = useClubFavorites()
const favorited = computed(() => (club.value?.id ? isFavorite(club.value.id) : false))
const { user, fetch: fetchAuth } = useAuth()
const { activeRole, pathForRole } = usePlatformRoles()
const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })
const { openLogin } = useAuthFlow()
const { fetchErrorMessage } = useFetchError()

/** Manager opening their own club from public /clubs → owner panel (no athlete-booking flash). */
if (club.value?.id && activeRole.value === 'CLUB_ADMIN') {
  if (user.value && !user.value.memberships?.length) {
    await fetchAuth()
  }
  const ownsThisClub = user.value?.memberships?.some((m) => m.club.id === club.value!.id)
  if (ownsThisClub) {
    selectedClubId.value = club.value.id
    await navigateTo(localePath(pathForRole('CLUB_ADMIN')), { replace: true })
  }
}

const waitlistSlotId = ref<string | null>(null)
const joiningWaitlist = ref(false)
const waitlistFeedback = ref('')
const waitlistFeedbackTone = ref<'success' | 'error'>('success')
const waitlistEnabled = computed(() => Boolean(club.value?.waitlistEnabled))

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
const deepLinkCourtIds = parseQueryCsv(route.query.court)
const deepLinkSlotIds = [
  ...parseQueryCsv(route.query.slot),
  ...parseQueryCsv(route.query.slots),
]
const deepLinkTimes = parseQueryCsv(route.query.time).map((t) => t.slice(0, 5))
const deepLinkSlotsPending = ref(deepLinkSlotIds.length > 0 || deepLinkTimes.length > 0)
let suppressSlotClear = deepLinkSlotsPending.value

const gallerySlide = ref(0)
const selectedDate = ref(deepLinkDate || today())
const focusedCourtId = ref<string | null>(deepLinkCourtIds[0] || null)
/** Only seed court multi-select from the URL when a slot/time handoff is pending. */
const selectedCourtIds = ref<string[]>(
  deepLinkSlotIds.length || deepLinkTimes.length ? deepLinkCourtIds : [],
)
/** Survive date changes + AuthFlow navigateTo (multi-day basket). */
const selectedSlotIds = useState<string[]>(`club-book-slot-ids-${slug}`, () => [])
const basketSlotsById = useState<Record<string, ClubSlot>>(`club-book-slot-map-${slug}`, () => ({}))
const confirmOpen = ref(false)
/** Survive AuthFlow navigateTo so confirm reopens after login on the same club page. */
const resumeConfirmAfterAuth = useState(`club-book-resume-${slug}`, () => false)

function clearBasket() {
  selectedSlotIds.value = []
  basketSlotsById.value = {}
}

function stampSlotDate(slot: ClubSlot, date = selectedDate.value): ClubSlot {
  return slot.date ? slot : { ...slot, date }
}

const { data: slots, pending: slotsPending, error: slotsError, refresh: refreshSlots } = await useFetch<ClubSlot[]>('/api/slots/available', {
  query: computed(() => ({
    club: slug,
    date: selectedDate.value,
    includeUnavailable: '1',
  })),
})
const showSlotsPending = useHeldPending(slotsPending, { forceRelease: () => Boolean(slotsError.value) })

const {
  enabled: externalSuspectedEnabled,
  isSlotSuspected,
} = useExternalSuspectedSlots({
  clubSlug: slug,
  date: selectedDate,
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
  // Only show ratings backed by reviews — never the schema default (4.5) as a demo score.
  const summary = club.value.reviewSummary
  if (summary && summary.count > 0 && summary.average != null && Number(summary.average) > 0) {
    return Number(summary.average).toFixed(1)
  }
  return '—'
})

const locationLine = computed(() => {
  if (!club.value) return ''
  const parts = [club.value.city, club.value.district].filter(Boolean)
  return parts.join('، ') || club.value.city || ''
})

const courts = computed(() => sortCourtsByOrdinal(club.value?.courts || []))

watch(
  courts,
  (list) => {
    if (!list.length) return
    if (!focusedCourtId.value || !list.some((c) => c.id === focusedCourtId.value)) {
      focusedCourtId.value = list[0]!.id
    }
    selectedCourtIds.value = selectedCourtIds.value.filter((id) => list.some((c) => c.id === id))
  },
  { immediate: true },
)

watch(selectedDate, () => {
  if (suppressSlotClear) return
  // Multi-day basket: keep selectedSlotIds / courts; only reset waitlist for the left day.
  waitlistSlotId.value = null
  waitlistFeedback.value = ''
})

const allSlots = computed(() => slots.value || [])

const courtSlots = computed(() => {
  const list = allSlots.value
  if (!focusedCourtId.value) return list
  return list.filter((s) => slotCourtId(s) === focusedCourtId.value)
})

function syncBasketFromKnown(known: ClubSlot[]) {
  const stamped = known.map((slot) => stampSlotDate(slot))
  basketSlotsById.value = upsertBasketSlots(
    basketSlotsById.value,
    selectedSlotIds.value,
    stamped,
  )
}

watch(
  () => slots.value,
  (list) => {
    if (!list) return
    // Drop basket hours that became unavailable on the day currently loaded.
    const drop = new Set(
      selectedSlotIds.value.filter((id) => {
        const slot = list.find((s) => s.id === id)
        return Boolean(slot && (!isSlotFree(slot) || isSlotSuspected(slot)))
      }),
    )
    if (drop.size) {
      selectedSlotIds.value = selectedSlotIds.value.filter((id) => !drop.has(id))
      if (!selectedSlotIds.value.length) confirmOpen.value = false
    }
    syncBasketFromKnown(list)

    if (!deepLinkSlotsPending.value) return
    const available = list
    let valid = deepLinkSlotIds.filter((id) => {
      const slot = available.find((s) => s.id === id)
      return Boolean(slot && isSlotFree(slot) && !isSlotSuspected(slot))
    })
    // Rebook fallback: match free slots by clock time when prior slot id is gone.
    if (!valid.length && deepLinkTimes.length) {
      valid = available
        .filter((s) => {
          if (!isSlotFree(s) || isSlotSuspected(s)) return false
          const start = (s.startTime || '').slice(0, 5)
          if (!deepLinkTimes.includes(start)) return false
          if (!deepLinkCourtIds.length) return true
          return deepLinkCourtIds.includes(slotCourtId(s))
        })
        .map((s) => s.id)
    }
    if (valid.length) {
      // Keep other-day basket picks; replace only the day currently loaded (deep-link / rebook).
      const otherDayIds = selectedSlotIds.value.filter((id) => {
        if (available.some((s) => s.id === id)) return false
        return Boolean(basketSlotsById.value[id])
      })
      selectedSlotIds.value = uniqueOrdered([...otherDayIds, ...valid])
      syncBasketFromKnown(available)
      const fromSlots = courtIdsFromSlots(
        valid
          .map((id) => available.find((s) => s.id === id))
          .filter((s): s is ClubSlot => Boolean(s)),
      )
      const courtIds = uniqueOrdered([...deepLinkCourtIds, ...fromSlots])
      if (courtIds.length) {
        selectedCourtIds.value = courtIds
        focusedCourtId.value = courtIds[0]!
      }
      // Guests: keep selection + login CTA — do not open confirm until signed in.
      if (user.value) {
        resumeConfirmAfterAuth.value = false
        // Same deferral as openConfirmSheet — instant open races AppModal dismiss.
        nextTick(() => {
          requestAnimationFrame(() => {
            confirmOpen.value = true
          })
        })
      }
    }
    deepLinkSlotsPending.value = false
    nextTick(() => {
      suppressSlotClear = false
    })
  },
  { immediate: true },
)

function isSlotBooked(slot: ClubSlot) {
  return !isSlotFree(slot)
}

function isSlotSelected(id: string) {
  return selectedSlotIds.value.includes(id)
}

function courtNumberLabel(courtId: string) {
  const idx = courts.value.findIndex((c) => c.id === courtId)
  if (idx < 0) return ''
  const court = courts.value[idx]!
  const n = courtDisplayNumber(
    { nameFa: court.nameFa || '', nameEn: court.nameEn },
    idx,
  )
  return t('booking.courtNumber', { n: formatNumber(n) })
}

function formatBasketDateLabel(iso: string) {
  const j = isoToJalaali(iso)
  const weekday = formatWeekday(iso, 'long')
  return `${formatNumber(j.jd)} ${PERSIAN_MONTHS[j.jm - 1] ?? ''} ${weekday}`
}

const selectedSlots = computed(() => {
  const courtOrder = courts.value.map((c) => c.id)
  const liveById = new Map(allSlots.value.map((s) => [s.id, s]))
  const resolved = resolveBasketSlots(
    selectedSlotIds.value,
    basketSlotsById.value,
    allSlots.value.map((s) => stampSlotDate(s)),
  )
  const picked = resolved.filter((slot) => {
    const live = liveById.get(slot.id)
    if (live) return isSlotFree(live) && !isSlotSuspected(live)
    // Other calendar day: keep cached pick until that day is loaded again.
    return Boolean(slot.date)
  })
  return sortSlotsByTimeThenCourt(picked, courtOrder)
})

const basketDates = computed(() =>
  uniqueOrdered(
    selectedSlots.value
      .map((s) => s.date || '')
      .filter(Boolean),
  ).sort(),
)

function dayHasBasket(iso: string) {
  return basketDates.value.includes(iso)
}

/** Solid green = this court has basket hours (matches slot legend). Never focus-only. */
function isCourtChipActive(courtId: string) {
  return selectedSlots.value.some((s) => slotCourtId(s) === courtId)
}

/** Armed for multi-court hour apply, but no basket hours yet — outline, not green. */
function isCourtChipTargeted(courtId: string) {
  if (isCourtChipActive(courtId)) return false
  return selectedCourtIds.value.includes(courtId)
}

function courtHasChipSelection(courtId: string) {
  return isCourtChipActive(courtId) || isCourtChipTargeted(courtId)
}

function toggleCourt(courtId: string) {
  waitlistSlotId.value = null
  waitlistFeedback.value = ''
  const selected = selectedCourtIds.value
  const chipOn = courtHasChipSelection(courtId)
  if (chipOn) {
    // One click off: drop chip + that court's basket slots across all days.
    const nextSelected = selected.filter((id) => id !== courtId)
    selectedCourtIds.value = nextSelected
    const known = [
      ...Object.values(basketSlotsById.value),
      ...allSlots.value.map((s) => stampSlotDate(s)),
    ]
    selectedSlotIds.value = removeSlotsForCourt(selectedSlotIds.value, courtId, known)
    syncBasketFromKnown(known)
    if (nextSelected.length) {
      focusedCourtId.value = nextSelected.includes(focusedCourtId.value || '')
        ? focusedCourtId.value
        : nextSelected[0]!
      return
    }
    // Prefer a court that still has basket hours; else first court for browsing
    // (focus alone must not light the chip — see isCourtChipActive).
    const basketCourts = courtIdsFromSlots(selectedSlots.value)
    focusedCourtId.value = basketCourts[0] || courts.value[0]?.id || null
    return
  }
  focusedCourtId.value = courtId
  // Empty basket: browsing only — do not accumulate empty multi-select greens.
  // With basket hours: add this court so the next hour applies across the set.
  if (selectedSlots.value.length) {
    selectedCourtIds.value = [...selected, courtId]
  } else {
    selectedCourtIds.value = []
  }
}

function maybeResumeConfirm() {
  if (!user.value || !resumeConfirmAfterAuth.value) return
  if (!selectedSlots.value.length) return
  resumeConfirmAfterAuth.value = false
  waitlistSlotId.value = null
  nextTick(() => {
    requestAnimationFrame(() => {
      confirmOpen.value = true
    })
  })
}

watch(
  () => [Boolean(user.value), selectedSlots.value.map((s) => s.id).join(',')] as const,
  () => maybeResumeConfirm(),
)

const bookConfirmCtaLabel = computed(() =>
  user.value ? t('auth.continueConfirm') : t('booking.loginToContinue'),
)

const bookingSummary = computed(() => {
  const picked = selectedSlots.value
  if (!picked.length) return ''
  const courtLabels = uniqueOrdered(
    courtIdsFromSlots(picked).map((id) => courtNumberLabel(id)).filter(Boolean),
  )
  const times = timesFromSlots(picked).map((time) => formatTimeLabel(time))
  const dateLabels = basketDates.value.map((iso) => formatBasketDateLabel(iso))
  return t('clubs.bookingSummarySelected', {
    date: joinWithAnd(dateLabels),
    courts: joinWithAnd(courtLabels),
    times: joinWithAnd(times),
  })
})

const selectedCourtLabel = computed(() => {
  const ids = courtIdsFromSlots(selectedSlots.value)
  const labels = ids.map((id) => courtNumberLabel(id)).filter(Boolean)
  return joinWithAnd(labels)
})

const selectedCourtIdsForReturn = computed(() => {
  const fromSlots = courtIdsFromSlots(selectedSlots.value)
  return uniqueOrdered([...fromSlots, ...selectedCourtIds.value]).join(',')
})

const sportLabel = computed(() => {
  const court = courts.value.find((c) => c.id === focusedCourtId.value) || courts.value[0]
  const sportKey = court?.sport?.slug
  if (sportKey === 'padel') return t('clubs.sportCourtPadel')
  if (sportKey === 'tennis') return t('clubs.sportCourtTennis')
  return t('clubs.sportCourtGeneric')
})

/** Sport name only (پدل/تنیس) — never prefix with «زمین» (SEO templates already include it). */
const sportSeoLabel = computed(() => {
  const court = courts.value.find((c) => c.id === focusedCourtId.value) || courts.value[0]
  const sportKey = court?.sport?.slug
  if (sportKey === 'padel') return t('clubs.sportPadel')
  if (sportKey === 'tennis') return t('clubs.sportTennis')
  const slugs = new Set(
    courts.value.map((c) => c.sport?.slug).filter((s): s is string => Boolean(s)),
  )
  if (slugs.has('padel') && slugs.has('tennis')) return t('home.sportsLabel')
  if (slugs.has('padel')) return t('clubs.sportPadel')
  if (slugs.has('tennis')) return t('clubs.sportTennis')
  return t('home.sportsLabel')
})

const bookableEquipment = computed(() => {
  const list = club.value?.equipment || []
  return list.filter((item) => {
    if (item.category !== 'RENTAL' && item.category !== 'SELL') return false
    return Math.max(0, Number(item.quantity ?? 1)) > 0
  })
})

/** Canva (3): rate footnotes under slot grid — only from real pricing, never invent a second band. */
function toThousand(value: number) {
  return formatNumber(Math.round(value / 1000))
}

const selectedCourt = computed(() => {
  if (!focusedCourtId.value) return courts.value[0]
  return courts.value.find((c) => c.id === focusedCourtId.value) || courts.value[0]
})

const pricingFootnotes = computed(() => {
  if (!club.value) return [] as string[]
  const notes: string[] = []
  const court = selectedCourt.value
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
    const clubPricing = club.value.pricing || []
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

  const minutes = club.value.defaultSessionDurationMinutes ?? 60
  notes.push(t('clubs.sessionDurationNote', { minutes: formatNumber(minutes) }))
  return notes
})

const confirmSlots = computed(() =>
  selectedSlots.value.map((slot) => {
    const courtId = slotCourtId(slot)
    const court = courts.value.find((c) => c.id === courtId)
    return {
      ...slot,
      date: slot.date || selectedDate.value,
      courtId,
      courtLabel: courtNumberLabel(courtId),
      courtPrice: court?.price,
      pricingJson: court?.pricingJson ?? null,
    }
  }),
)

/** Earliest basket day — equipment availability API is single-date (matches server primary). */
const confirmPrimaryDate = computed(() => basketDates.value[0] || selectedDate.value)

function openConfirmSheet() {
  // Prefer resolved free slots — orphan ids leave CTA enabled but open an empty sheet.
  if (!selectedSlots.value.length) return
  if (!user.value) {
    resumeConfirmAfterAuth.value = true
    openLogin({
      returnTo: buildReturnTo(route.path, {
        date: confirmPrimaryDate.value,
        court: selectedCourtIdsForReturn.value || undefined,
        slots: selectedSlotIds.value.join(','),
      }),
      notice: t('booking.loginToConfirmNotice'),
    })
    return
  }
  resumeConfirmAfterAuth.value = false
  waitlistSlotId.value = null
  // Defer past the opening click so AppModal mounts after the gesture ends
  // (otherwise the same click can dismiss the sheet — dead «تایید و ادامه»).
  nextTick(() => {
    requestAnimationFrame(() => {
      confirmOpen.value = true
    })
  })
}

function onConfirmSuccess() {
  resumeConfirmAfterAuth.value = false
  clearBasket()
  waitlistSlotId.value = null
}

async function onSlotConflict() {
  confirmOpen.value = false
  clearBasket()
  waitlistSlotId.value = null
  waitlistFeedback.value = ''
  await refreshSlots()
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

const { onPointerDown: onGalleryPointerDown, onPointerUp: onGalleryPointerUp } = useSwipePager(
  gallerySlide,
  () => gallerySlides.value.length,
)

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

const monthLabel = computed(() => `${PERSIAN_MONTHS[viewMonth.value - 1] ?? ''} ${formatYear(viewYear.value)}`)

const calendarCells = computed(() => {
  const daysInMonth = jalaaliDaysInMonth(viewYear.value, viewMonth.value)
  const [gy, gm, gd] = jalaaliToIso(viewYear.value, viewMonth.value, 1).split('-').map(Number)
  const weekday = new Date(gy ?? 0, (gm ?? 1) - 1, gd ?? 1).getDay()
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

function calendarDayAria(cell: { day: number | null; iso: string | null }) {
  if (!cell.iso || cell.day == null) return undefined
  const weekday = formatWeekday(cell.iso, 'long')
  const j = isoToJalaali(cell.iso)
  const dateLabel = `${formatNumber(cell.day)} ${PERSIAN_MONTHS[j.jm - 1] ?? ''} ${weekday}`
  if (cell.iso < today()) return t('clubs.calendarDayDisabled', { date: dateLabel })
  if (cell.iso === selectedDate.value) return t('clubs.calendarDaySelected', { date: dateLabel })
  if (dayHasBasket(cell.iso)) return t('clubs.calendarDayBasket', { date: dateLabel })
  return t('clubs.calendarDaySelectable', { date: dateLabel })
}

function slotAriaLabel(slot: ClubSlot) {
  const time = formatTimeLabel(slot.startTime || '')
  if (isSlotSelected(slot.id)) return t('clubs.slotAriaSelected', { time })
  if (waitlistSlotId.value === slot.id) return t('clubs.slotAriaWaitlist', { time })
  if (isSlotBooked(slot)) return t('clubs.slotAriaBooked', { time })
  if (isSlotSuspected(slot)) return t('clubs.slotAriaSuspected', { time })
  return t('clubs.slotAriaFree', { time })
}

const clubPageName = computed(() =>
  club.value ? localizedField(club.value, 'nameFa', 'nameEn') : '',
)

const siteBase = computed(() => String(config.public.siteUrl || '').replace(/\/$/, '') || 'https://inboxs.ir')

const defaultOgImage = computed(() => `${siteBase.value}/hero/tennis-court.jpg`)

const clubSeoTitle = computed(() => {
  if (!club.value || !clubPageName.value) return t('clubs.seoTitle')
  return t('clubs.seoTitleClub', {
    sport: sportSeoLabel.value,
    name: clubPageName.value,
    city: club.value.city || 'تهران',
  })
})

const clubSeoDescription = computed(() => {
  if (!club.value) return t('home.seoDescription')
  return t('clubs.seoDescription', {
    name: clubPageName.value,
    location: locationLine.value || club.value.city || 'تهران',
    sport: sportSeoLabel.value,
  })
})

const clubCanonicalUrl = computed(() => {
  if (!club.value) return ''
  return `${siteBase.value}${localePath(`/clubs/${slug}`)}`
})

const clubOgImage = computed(() => {
  const image = club.value?.image || activeGallery.value
  if (!image) return defaultOgImage.value
  if (image.startsWith('http://') || image.startsWith('https://')) return image
  return `${siteBase.value}${image.startsWith('/') ? image : `/${image}`}`
})

/** Localized sport names for JSON-LD + citation copy (پدل/تنیس only when courts say so). */
const clubSportNames = computed(() => {
  if (!club.value) return [] as string[]
  return [...new Set(
    (club.value.courts || [])
      .map((court) => {
        if (court.sport?.slug === 'padel') return t('clubs.sportPadel')
        if (court.sport?.slug === 'tennis') return t('clubs.sportTennis')
        return ''
      })
      .filter(Boolean),
  )]
})

const clubAmenityNames = computed(() =>
  (club.value?.amenities || []).map((item) => amenityLabel(item)),
)

/** Crawlable FA prose + FAQs for Google snippets and AI citations — real fields only. */
const clubCitationCopy = computed(() => {
  if (!club.value || !clubPageName.value || !clubCanonicalUrl.value) return null
  return buildClubCitationCopy({
    name: clubPageName.value,
    city: club.value.city,
    district: club.value.district,
    address: localizedField(club.value, 'addressFa', 'addressEn') || null,
    sports: clubSportNames.value,
    amenities: clubAmenityNames.value,
    openHour: club.value.openHour,
    closeHour: club.value.closeHour,
    priceFrom: club.value.priceFrom,
    priceTo: club.value.priceTo,
    descriptionFa: club.value.descriptionFa,
    pageUrl: clubCanonicalUrl.value,
  })
})

useSeoMeta({
  title: () => clubSeoTitle.value,
  description: () => clubSeoDescription.value,
  ogTitle: () => clubSeoTitle.value,
  ogDescription: () => clubSeoDescription.value,
  ogImage: () => clubOgImage.value,
  ogUrl: () => clubCanonicalUrl.value || undefined,
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterImage: () => clubOgImage.value,
})

useHead(() => {
  const head: { link?: Array<{ rel: string; href: string }>; script?: Array<{ type: string; innerHTML: string }> } = {}
  if (clubCanonicalUrl.value) {
    head.link = [{ rel: 'canonical', href: clubCanonicalUrl.value }]
  }
  if (club.value && clubPageName.value) {
    const address = localizedField(club.value, 'addressFa', 'addressEn') || club.value.city || ''
    const description = localizedField(club.value, 'descriptionFa', 'descriptionEn')
    const coords = club.value.coordinates
    const summary = club.value.reviewSummary
    const scripts: Array<{ type: string; innerHTML: string }> = []
    const jsonLd = buildClubSportsActivityLocationJsonLd({
      name: clubPageName.value,
      url: clubCanonicalUrl.value || undefined,
      image: clubOgImage.value || undefined,
      description,
      telephone: club.value.phone,
      city: club.value.city,
      streetAddress: address || undefined,
      lat: coords?.lat,
      lng: coords?.lng,
      openHour: club.value.openHour,
      closeHour: club.value.closeHour,
      priceFrom: club.value.priceFrom,
      priceTo: club.value.priceTo,
      sports: clubSportNames.value,
      amenities: clubAmenityNames.value,
      aggregateRating:
        summary?.count && summary.average != null && summary.average > 0
          ? { ratingValue: summary.average, reviewCount: summary.count }
          : null,
    })
    // Escape `<` so club name/address cannot break out of the LD+JSON script tag.
    scripts.push({ type: 'application/ld+json', innerHTML: serializeJsonLd(jsonLd) })

    const faqJsonLd = clubCitationCopy.value
      ? buildClubFaqPageJsonLd(clubCitationCopy.value.faqs, {
          url: clubCanonicalUrl.value || undefined,
        })
      : null
    if (faqJsonLd) {
      scripts.push({ type: 'application/ld+json', innerHTML: serializeJsonLd(faqJsonLd) })
    }
    head.script = scripts
  }
  return head
})

function toggleSlot(slot: ClubSlot) {
  if (isSlotBooked(slot)) {
    if (!waitlistEnabled.value) return
    clearBasket()
    waitlistFeedback.value = ''
    waitlistSlotId.value = waitlistSlotId.value === slot.id ? null : slot.id
    return
  }
  // External suspected (مشکوک / تماس بگیرید): hard-lock — call club, no Inboxs reserve.
  if (isSlotSuspected(slot)) return
  waitlistSlotId.value = null
  waitlistFeedback.value = ''
  // Always include the slot's court + focused court so an empty chip selection
  // cannot no-op toggleHourOnCourts (selection looks dead, CTA stays disabled).
  const slotCourt = slotCourtId(slot)
  if (slotCourt && focusedCourtId.value !== slotCourt) {
    focusedCourtId.value = slotCourt
  }
  const applyCourtIds = uniqueOrdered(
    [...selectedCourtIds.value, focusedCourtId.value, slotCourt].filter((id): id is string => Boolean(id)),
  )
  if (!selectedCourtIds.value.length && slotCourt) {
    selectedCourtIds.value = [slotCourt]
  }
  // Only current-day slots participate in hour toggle so other days keep their picks.
  selectedSlotIds.value = toggleHourOnCourts({
    selectedSlotIds: selectedSlotIds.value,
    selectedCourtIds: applyCourtIds,
    startTime: slot.startTime,
    // Exclude suspected so multi-court hour apply cannot add EXTERNAL_BUSY hours.
    slots: allSlots.value.filter((s) => !isSlotSuspected(s)),
    clickedSlotId: slot.id,
  })
  syncBasketFromKnown(allSlots.value)
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
        courtId: focusedCourtId.value || slot.courtId || slot.court?.id,
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
  <div v-if="showClubPending" class="tail-page-enter">
    <AppVenusSpinner :label="t('common.loading')" />
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
  <div v-else-if="club" class="tail-page-enter space-y-3">
    <CanvaPublicChrome back-to="/clubs" />
    <div class="canva-club-detail">
      <!-- 1. Gallery: full-bleed, arrows, red active dots -->
      <section
        class="canva-club-gallery"
        @pointerdown="onGalleryPointerDown"
        @pointerup="onGalleryPointerUp"
      >
        <img
          :src="activeGallery"
          :alt="t('clubs.galleryImageAlt', {
            name: localizedField(club, 'nameFa', 'nameEn'),
            index: gallerySlide + 1,
            total: gallerySlides.length,
          })"
          class="canva-club-gallery-media"
        />
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

      <div class="canva-club-detail-intro">
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
      </div>

        <!-- 4. Booking widget: legend + courts + calendar/slots + square CTA -->
        <section class="canva-club-detail-section canva-club-detail-book">
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
            <span v-if="externalSuspectedEnabled" class="canva-club-legend-item" role="listitem">
              <span class="canva-club-legend-swatch canva-club-legend-suspected" aria-hidden="true" />
              {{ t('clubs.slotLegendSuspected') }}
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
                      'canva-club-cal-day-basket': dayHasBasket(cell.iso) && cell.iso !== selectedDate,
                      'canva-club-cal-day-disabled': cell.iso < today(),
                    }"
                    :disabled="cell.iso < today()"
                    :aria-label="calendarDayAria(cell)"
                    :aria-current="cell.iso === selectedDate ? 'date' : undefined"
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
                  :class="{
                    'canva-club-court-num-active': isCourtChipActive(court.id),
                    'canva-club-court-num-target': isCourtChipTargeted(court.id),
                    'canva-club-court-num-focus': focusedCourtId === court.id
                      && !isCourtChipActive(court.id)
                      && !isCourtChipTargeted(court.id),
                  }"
                  :aria-label="t('booking.courtNumber', { n: formatNumber(courtDisplayNumber(court, idx)) })"
                  :aria-pressed="courtHasChipSelection(court.id)"
                  :aria-current="focusedCourtId === court.id ? 'true' : undefined"
                  @click="toggleCourt(court.id)"
                >
                  {{ formatNumber(courtDisplayNumber(court, idx)) }}
                </button>
              </div>
              <p
                v-if="selectedCourtIds.length > 1 || courtIdsFromSlots(selectedSlots).length > 1"
                class="mb-2 text-start text-[11px] leading-snug text-brand-gray-600"
              >
                {{ t('clubs.multiCourtTimeHint') }}
              </p>
              <div class="canva-club-slot-grid">
                <div v-if="showSlotsPending" class="col-span-full flex justify-center py-8" role="status">
                  <AppVenusSpinner size="sm" :label="t('common.loading')" compact />
                </div>
                <div v-else-if="slotsError" class="col-span-full space-y-3 py-8 text-center text-sm text-red-700" role="alert">
                  <p>{{ t('common.error') }}</p>
                  <button type="button" class="btn-secondary" @click="refreshSlots">{{ t('common.retry') }}</button>
                </div>
                <button
                  v-else
                  v-for="slot in courtSlots"
                  :key="slot.id"
                  type="button"
                  class="canva-club-slot"
                  :class="{
                    'canva-club-slot-booked': isSlotBooked(slot) && waitlistSlotId !== slot.id,
                    'canva-club-slot-suspected': !isSlotBooked(slot) && isSlotSuspected(slot),
                    'canva-club-slot-active': isSlotSelected(slot.id) || waitlistSlotId === slot.id,
                  }"
                  :disabled="(isSlotBooked(slot) && !waitlistEnabled) || isSlotSuspected(slot)"
                  :aria-label="slotAriaLabel(slot)"
                  :aria-pressed="isSlotSelected(slot.id) || waitlistSlotId === slot.id"
                  @click="toggleSlot(slot)"
                >
                  {{ formatTimeLabel(slot.startTime) }}
                  <span
                    v-if="!isSlotBooked(slot) && isSlotSuspected(slot)"
                    class="canva-club-slot-suspected-label"
                  >
                    {{ t('clubs.slotSuspectedLabel') }}
                  </span>
                </button>
                <p v-if="!showSlotsPending && !slotsError && !courtSlots.length" class="canva-club-detail-desc col-span-full">
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
            <p v-else-if="bookingSummary" class="canva-club-book-summary text-start">{{ bookingSummary }}</p>
            <p v-else class="canva-club-book-summary text-start text-brand-gray-600">{{ t('clubs.selectSlotToContinue') }}</p>
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
              :disabled="!selectedSlots.length"
              @click="openConfirmSheet"
            >
              {{ bookConfirmCtaLabel }}
            </button>
          </div>
        </section>

        <!-- 5. More info: address/contact RIGHT, map LEFT -->
        <section class="canva-club-detail-section canva-club-detail-more">
          <h2 class="canva-club-detail-section-title">{{ t('clubs.moreInfo') }}</h2>
          <div class="canva-club-more">
            <div class="canva-club-more-copy">
              <div>
                <p class="canva-club-more-label">{{ t('clubs.addressLabel') }}</p>
                <p class="canva-club-more-value">{{ localizedField(club, 'addressFa', 'addressEn') }}</p>
              </div>
              <div v-if="club.phone">
                <p class="canva-club-more-label">{{ t('clubs.contactLabel') }}</p>
                <a class="canva-club-more-value canva-club-detail-link" dir="ltr" :href="`tel:${club.phone}`">{{ formatPhone(club.phone) }}</a>
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
        <section class="canva-club-detail-section canva-club-detail-reviews">
          <h2 class="canva-club-detail-section-title">{{ t('clubs.athleteReviews') }}</h2>
          <div v-if="club.testimonials?.length" class="canva-club-reviews">
            <article v-for="item in club.testimonials" :key="item.id" class="canva-club-review">
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-bold text-brand-navy">{{ item.authorName }}</p>
                <p class="canva-court-card-rating !mt-0 text-brand-navy">
                  <span class="canva-court-card-star" aria-hidden="true">★</span>
                  {{ formatNumber(item.rating) }}
                </p>
              </div>
              <p class="mt-1 text-sm text-brand-gray-600">{{ item.body }}</p>
            </article>
          </div>
          <div v-else class="canva-club-reviews-empty">
            {{ t('clubs.reviewsEmpty') }}
          </div>
        </section>

        <!-- 7. Crawlable FA citation copy + FAQ (Google + AI assistants) — real fields only -->
        <section
          v-if="clubCitationCopy"
          class="canva-club-detail-section canva-club-citation"
          aria-label="اطلاعات باشگاه برای رزرو"
        >
          <p class="canva-club-detail-desc">{{ clubCitationCopy.intro }}</p>
          <div
            v-for="section in clubCitationCopy.sections"
            :key="section.heading"
            class="space-y-1"
          >
            <h2 class="canva-club-detail-section-title">{{ section.heading }}</h2>
            <p class="canva-club-detail-desc">{{ section.body }}</p>
          </div>
          <AppFaqAccordion
            :items="clubCitationCopy.faqs"
            heading-id="club-citation-faq-heading"
            :heading="clubCitationFaqHeading()"
            heading-level="h2"
          />
        </section>
    </div>

      <CourtBookingConfirmSheet
        :open="confirmOpen"
        :club-id="club.id"
        :club-name="localizedField(club, 'nameFa', 'nameEn')"
        :location-line="locationLine"
        :sport-label="sportLabel"
        :rating-display="ratingDisplay"
        :date="confirmPrimaryDate"
        :court-id="selectedCourtIdsForReturn || undefined"
        :court-label="selectedCourtLabel"
        :slots="confirmSlots"
        :bookable-equipment="bookableEquipment"
        @close="confirmOpen = false"
        @success="onConfirmSuccess"
        @slot-conflict="onSlotConflict"
      />
  </div>
</template>
