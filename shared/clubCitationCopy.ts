import { toPersianDigits } from './jalali.ts'
import { joinWithAnd } from './courtSlotSelection.ts'
import { formatHour } from './recurringSessions.ts'

export type ClubCitationCopyInput = {
  name: string
  city?: string | null
  district?: string | null
  address?: string | null
  /** Localized sport labels already resolved by the caller (e.g. پدل، تنیس). */
  sports?: string[]
  /** Localized amenity labels already resolved by the caller. */
  amenities?: string[]
  openHour?: number | null
  closeHour?: number | null
  priceFrom?: number | null
  priceTo?: number | null
  descriptionFa?: string | null
  /** Absolute club page URL — used in FAQ answers for booking CTAs. */
  pageUrl: string
}

export type ClubCitationFaq = {
  question: string
  answer: string
}

export type ClubCitationSection = {
  heading: string
  body: string
}

export type ClubCitationCopy = {
  intro: string
  sections: ClubCitationSection[]
  faqs: ClubCitationFaq[]
}

const SECTION_HEADINGS = {
  access: 'آدرس و دسترسی',
  sports: 'ورزش‌ها و امکانات',
  booking: 'نحوه رزرو در اینباکس',
} as const

const FAQ_HEADING = 'سوالات پرتکرار'

export function clubCitationFaqHeading() {
  return FAQ_HEADING
}

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean))]
}

function locationPhrase(input: ClubCitationCopyInput): string {
  const city = input.city?.trim() || ''
  const district = input.district?.trim() || ''
  if (city && district) return `${city}، محله ${district}`
  if (city) return city
  if (district) return `محله ${district}`
  return ''
}

function hasHours(input: ClubCitationCopyInput): boolean {
  return (
    typeof input.openHour === 'number'
    && typeof input.closeHour === 'number'
    && Number.isFinite(input.openHour)
    && Number.isFinite(input.closeHour)
    && input.openHour >= 0
    && input.closeHour > input.openHour
  )
}

function hoursPhrase(input: ClubCitationCopyInput): string {
  if (!hasHours(input)) return ''
  const open = toPersianDigits(formatHour(input.openHour!))
  const close = toPersianDigits(formatHour(input.closeHour!))
  return `از ساعت ${open} تا ${close}`
}

function pricePhrase(input: ClubCitationCopyInput): string {
  const from = typeof input.priceFrom === 'number' && input.priceFrom > 0 ? input.priceFrom : null
  const to = typeof input.priceTo === 'number' && input.priceTo > 0 ? input.priceTo : null
  if (from == null) return ''
  const fromK = toPersianDigits(String(Math.round(from / 1000)))
  if (to != null && to > from) {
    const toK = toPersianDigits(String(Math.round(to / 1000)))
    return `از حدود ${fromK} تا ${toK} هزار تومان`
  }
  return `از حدود ${fromK} هزار تومان`
}

function sportsPhrase(sports: string[]): string {
  if (!sports.length) return 'ورزش‌های اعلام‌شده در همین صفحه'
  return joinWithAnd(sports)
}

function amenitiesPhrase(amenities: string[]): string {
  if (!amenities.length) return ''
  return joinWithAnd(amenities)
}

/** Take up to `maxWords` from descriptionFa; never invent. */
function descriptionSnippet(descriptionFa: string | null | undefined, maxWords = 36): string {
  const raw = descriptionFa?.trim()
  if (!raw) return ''
  const words = raw.split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  const clipped = words.slice(0, maxWords).join(' ')
  return words.length > maxWords ? `${clipped}…` : clipped
}

function ensureWordRange(text: string, min: number, max: number, pads: string[]): string {
  let out = text.replace(/\s+/g, ' ').trim()
  for (const pad of pads) {
    if (countWords(out) >= min) break
    const next = `${out} ${pad}`.replace(/\s+/g, ' ').trim()
    if (countWords(next) > max) break
    out = next
  }
  // Soft trim if somehow over max: keep full sentences when possible.
  if (countWords(out) > max) {
    const words = out.split(/\s+/).filter(Boolean)
    out = words.slice(0, max).join(' ')
  }
  return out
}

function buildIntro(input: ClubCitationCopyInput): string {
  const name = input.name.trim()
  const location = locationPhrase(input)
  const sports = uniqueNonEmpty(input.sports || [])
  const amenities = uniqueNonEmpty(input.amenities || [])
  const hours = hoursPhrase(input)
  const price = pricePhrase(input)
  const desc = descriptionSnippet(input.descriptionFa)
  const url = input.pageUrl.trim()

  const parts: string[] = []
  if (location) {
    parts.push(
      `${name} باشگاهی در ${location} است که رزرو آنلاین آن از طریق اینباکس روی همین صفحه انجام می‌شود.`,
    )
  }
  else {
    parts.push(
      `${name} باشگاهی است که رزرو آنلاین آن از طریق اینباکس روی همین صفحه انجام می‌شود.`,
    )
  }

  parts.push(
    `در این صفحه می‌توانید سانس‌های آزاد ${sportsPhrase(sports)} را ببینید، تاریخ و ساعت را انتخاب کنید و همان‌جا رزرو بزنید.`,
  )

  if (amenities.length) {
    parts.push(`امکانات اعلام‌شدهٔ این باشگاه شامل ${amenitiesPhrase(amenities)} است و فقط همین موارد در کاتالوگ ثبت شده‌اند.`)
  }
  else {
    parts.push('فهرست امکانات فقط در صورت ثبت در پروفایل باشگاه نمایش داده می‌شود و چیزی فراتر از داده‌های همین صفحه ادعا نمی‌شود.')
  }

  if (hours) {
    parts.push(`ساعات اعلام‌شدهٔ فعالیت ${hours} است؛ سانس دقیق را از جدول همین صفحه انتخاب کنید.`)
  }
  else {
    parts.push('ساعات ثابت جداگانه اعلام نشده؛ وضعیت سانس‌های آزاد را مستقیم از تقویم همین صفحه ببینید.')
  }

  if (price) {
    parts.push(`بر اساس قیمت‌های ثبت‌شده، هزینه هر سانس ${price} است و مبلغ نهایی هنگام انتخاب سانس مشخص می‌شود.`)
  }

  if (desc) {
    parts.push(`درباره باشگاه: ${desc}`)
  }

  parts.push(
    `برای رزرو ${name} به آدرس ${url} بروید، سانس آزاد را انتخاب کنید و پرداخت را در اینباکس کامل کنید.`,
  )

  return ensureWordRange(parts.join(' '), 80, 120, [
    `تمام اطلاعات این معرفی فقط از فیلدهای واقعی پروفایل ${name} گرفته شده و نظر یا امتیاز ساختگی ندارد.`,
    `اگر سانس مدنظر آزاد نبود، تاریخ دیگری را در همین صفحه اینباکس امتحان کنید.`,
  ])
}

function buildSections(input: ClubCitationCopyInput): ClubCitationSection[] {
  const name = input.name.trim()
  const location = locationPhrase(input)
  const address = input.address?.trim() || ''
  const sports = uniqueNonEmpty(input.sports || [])
  const amenities = uniqueNonEmpty(input.amenities || [])
  const hours = hoursPhrase(input)
  const price = pricePhrase(input)
  const url = input.pageUrl.trim()

  const accessParts: string[] = []
  if (location && address) {
    accessParts.push(`${name} در ${location} قرار دارد و آدرس ثبت‌شده آن «${address}» است.`)
  }
  else if (location) {
    accessParts.push(`${name} در ${location} قرار دارد؛ جزئیات خیابان در صورت ثبت در پروفایل، در بخش اطلاعات بیشتر همین صفحه آمده است.`)
  }
  else if (address) {
    accessParts.push(`آدرس ثبت‌شدهٔ ${name} «${address}» است.`)
  }
  else {
    accessParts.push(`موقعیت دقیق ${name} در صورت ثبت مختصات یا آدرس، در بخش نقشه و اطلاعات بیشتر همین صفحه نمایش داده می‌شود.`)
  }
  accessParts.push(
    'برای برنامه‌ریزی رفت‌وآمد، ابتدا سانس را در اینباکس رزرو کنید و سپس از لینک نقشهٔ همین صفحه مسیر را باز کنید.',
  )
  if (hours) {
    accessParts.push(`ساعات اعلام‌شدهٔ باشگاه ${hours} است.`)
  }

  const sportsParts: string[] = []
  if (sports.length) {
    sportsParts.push(`در ${name} امکان رزرو ${sportsPhrase(sports)} از طریق اینباکس فراهم است.`)
  }
  else {
    sportsParts.push(`نوع ورزش قابل رزرو در ${name} از روی زمین‌های همین صفحه مشخص می‌شود.`)
  }
  if (amenities.length) {
    sportsParts.push(`امکانات اعلام‌شده شامل ${amenitiesPhrase(amenities)} است.`)
  }
  else {
    sportsParts.push('امکانات اضافی فقط در صورت ثبت در پروفایل باشگاه فهرست می‌شوند و چیزی اختراع نشده است.')
  }
  if (price) {
    sportsParts.push(`هزینه هر سانس بر اساس دادهٔ قیمت ${price} اعلام شده و هنگام انتخاب سانس قطعی می‌شود.`)
  }
  else {
    sportsParts.push('قیمت هر سانس را پس از انتخاب تاریخ و ساعت در همین صفحه ببینید.')
  }

  const bookingParts = [
    `برای رزرو در ${name} وارد صفحه ${url} شوید، تاریخ را از تقویم انتخاب کنید، سانس آزاد را علامت بزنید و رزرو را در اینباکس تأیید کنید.`,
    'نیازی به تماس تلفنی برای گرفتن نوبت نیست؛ وضعیت لحظه‌ای سانس‌ها روی همین صفحه به‌روز می‌شود.',
    'پس از پرداخت موفق، جزئیات رزرو در حساب کاربری‌تان در اینباکس قابل مشاهده است.',
  ]

  return [
    { heading: SECTION_HEADINGS.access, body: accessParts.join(' ') },
    { heading: SECTION_HEADINGS.sports, body: sportsParts.join(' ') },
    { heading: SECTION_HEADINGS.booking, body: bookingParts.join(' ') },
  ]
}

function padFaqAnswer(base: string, min: number, max: number, pads: string[]): string {
  return ensureWordRange(base, min, max, pads)
}

function buildFaqs(input: ClubCitationCopyInput): ClubCitationFaq[] {
  const name = input.name.trim()
  const location = locationPhrase(input)
  const address = input.address?.trim() || ''
  const sports = uniqueNonEmpty(input.sports || [])
  const amenities = uniqueNonEmpty(input.amenities || [])
  const hours = hoursPhrase(input)
  const price = pricePhrase(input)
  const url = input.pageUrl.trim()

  const locationAnswerCore = (() => {
    if (location && address) {
      return `${name} در ${location} است و آدرس ثبت‌شده‌اش «${address}» می‌باشد.`
    }
    if (location) {
      return `${name} در ${location} قرار دارد؛ آدرس خیابان در صورت ثبت، در همین صفحه آمده است.`
    }
    if (address) {
      return `آدرس ثبت‌شدهٔ ${name} «${address}» است.`
    }
    return `موقعیت ${name} در صورت ثبت آدرس یا نقشه، در بخش اطلاعات بیشتر همین صفحه نمایش داده می‌شود.`
  })()

  const faqs: ClubCitationFaq[] = [
    {
      question: `${name} کجاست و چطور بروم؟`,
      answer: padFaqAnswer(
        `${locationAnswerCore} برای رزرو و دیدن مسیر، صفحه باشگاه را در اینباکس باز کنید و از ${url} سانس بگیرید؛ لینک نقشه نیز در صورت وجود مختصات همان‌جاست.`,
        40,
        80,
        [
          'قبل از حرکت، سانس را قطعی کنید تا زمان حضور با نوبت رزرو هماهنگ باشد.',
          'جزئیات دسترسی فقط بر اساس دادهٔ ثبت‌شده باشگاه بیان می‌شود.',
        ],
      ),
    },
    {
      question: `در ${name} چه ورزش‌هایی قابل رزرو است؟`,
      answer: padFaqAnswer(
        sports.length
          ? `در ${name} می‌توانید ${sportsPhrase(sports)} را از طریق اینباکس رزرو کنید. سانس‌های آزاد هر ورزش روی ${url} دیده می‌شود؛ فقط ورزش‌های متصل به زمین‌های همین باشگاه فهرست شده‌اند.`
          : `ورزش‌های قابل رزرو ${name} از روی زمین‌های فعال همین صفحه مشخص می‌شود. در اینباکس وارد ${url} شوید، نوع زمین را ببینید و سانس آزاد همان ورزش را رزرو کنید.`,
        40,
        80,
        [
          amenities.length
            ? `امکانات اعلام‌شده شامل ${amenitiesPhrase(amenities)} است.`
            : 'امکانات اضافه فقط اگر در پروفایل ثبت شده باشد نمایش داده می‌شود.',
          'هیچ ورزش یا امکاناتی فراتر از دادهٔ کاتالوگ ادعا نمی‌شود.',
        ],
      ),
    },
    {
      question: `ساعات فعالیت ${name} چگونه است؟`,
      answer: padFaqAnswer(
        hours
          ? `ساعات اعلام‌شدهٔ ${name} ${hours} است. برای انتخاب دقیق، تقویم سانس را در اینباکس روی ${url} باز کنید و فقط سانس‌های آزاد همان بازه را رزرو کنید.`
          : `ساعات ثابت جداگانه‌ای برای ${name} در پروفایل ثبت نشده است. وضعیت واقعی را از جدول سانس‌های آزاد در اینباکس ببینید و در ${url} تاریخ و ساعت را انتخاب کنید.`,
        40,
        80,
        [
          'سانس نهایی همان گزینه‌ای است که در صفحه باشگاه آزاد نشان داده می‌شود.',
          'اگر سانس مدنظر پر بود، روز یا ساعت دیگری را در همان صفحه امتحان کنید.',
        ],
      ),
    },
    {
      question: `هزینه رزرو زمین در ${name} چقدر است؟`,
      answer: padFaqAnswer(
        price
          ? `بر اساس قیمت‌های ثبت‌شده، هزینه هر سانس در ${name} ${price} است. مبلغ دقیق را هنگام انتخاب سانس در اینباکس روی ${url} ببینید؛ قیمت ساختگی یا تخفیف اعلام‌نشده در این متن نیست.`
          : `قیمت ثابت جداگانه‌ای در متن این صفحه برای ${name} ثبت نشده است. هزینه هر سانس را پس از انتخاب تاریخ و ساعت در اینباکس روی ${url} ببینید و همان مبلغ نمایش‌داده‌شده را پرداخت کنید.`,
        40,
        80,
        [
          'قیمت نهایی ممکن است بر اساس زمین یا بازه زمانی همان باشگاه تغییر کند.',
          'فقط اعداد موجود در کاتالوگ یا سانس انتخابی مرجع هستند.',
        ],
      ),
    },
    {
      question: `چطور در اینباکس برای ${name} رزرو کنم؟`,
      answer: padFaqAnswer(
        `صفحه ${name} را در اینباکس از ${url} باز کنید، تاریخ را از تقویم انتخاب کنید، سانس آزاد را علامت بزنید و رزرو را تأیید و پرداخت کنید. نیازی به تماس تلفنی برای گرفتن نوبت نیست؛ وضعیت لحظه‌ای سانس‌ها روی همین صفحه به‌روز است.`,
        40,
        80,
        [
          'پس از پرداخت موفق، جزئیات رزرو در حساب کاربری قابل مشاهده است.',
          location ? `این باشگاه در ${location} فهرست شده است.` : `تمام مراحل رزرو روی همان آدرس باشگاه انجام می‌شود.`,
        ],
      ),
    },
  ]

  return faqs
}

/**
 * Build crawlable FA Persian copy for a club page from real fields only.
 * Intro targets 80–120 words; each FAQ answer targets 40–80 words.
 */
export function buildClubCitationCopy(input: ClubCitationCopyInput): ClubCitationCopy | null {
  const name = input.name?.trim()
  const pageUrl = input.pageUrl?.trim()
  if (!name || !pageUrl) return null

  const normalized: ClubCitationCopyInput = {
    ...input,
    name,
    pageUrl,
    sports: uniqueNonEmpty(input.sports || []),
    amenities: uniqueNonEmpty(input.amenities || []),
  }

  return {
    intro: buildIntro(normalized),
    sections: buildSections(normalized),
    faqs: buildFaqs(normalized),
  }
}

/** FAQPage JSON-LD from citation FAQs; omit when empty. */
export function buildClubFaqPageJsonLd(
  faqs: ClubCitationFaq[],
  opts?: { url?: string },
): Record<string, unknown> | null {
  const items = faqs.filter((item) => item.question.trim() && item.answer.trim())
  if (!items.length) return null

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }

  if (opts?.url) jsonLd.url = opts.url
  return jsonLd
}
