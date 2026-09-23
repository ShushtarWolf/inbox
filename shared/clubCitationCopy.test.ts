import { describe, expect, it } from 'vitest'
import {
  buildClubCitationCopy,
  buildClubFaqPageJsonLd,
  countWords,
} from './clubCitationCopy.ts'
import { serializeJsonLd } from './jsonLd.ts'

const base = {
  name: 'باشگاه بهناز',
  city: 'تهران',
  district: 'نیاوران',
  address: 'خیابان پاسداران، کوچه تست',
  sports: ['پدل', 'تنیس'],
  amenities: ['پارکینگ', 'دوش'],
  openHour: 8,
  closeHour: 22,
  priceFrom: 500_000,
  priceTo: 800_000,
  descriptionFa: 'باشگاهی برای رزرو زمین پدل و تنیس با فضای مناسب تمرین.',
  pageUrl: 'https://inboxs.ir/clubs/behnaz',
}

describe('buildClubCitationCopy', () => {
  it('returns null without name or pageUrl', () => {
    expect(buildClubCitationCopy({ name: '', pageUrl: 'https://inboxs.ir/clubs/x' })).toBeNull()
    expect(buildClubCitationCopy({ name: 'باشگاه', pageUrl: '' })).toBeNull()
  })

  it('builds intro in the 80–120 word range from real fields', () => {
    const copy = buildClubCitationCopy(base)
    expect(copy).not.toBeNull()
    const words = countWords(copy!.intro)
    expect(words).toBeGreaterThanOrEqual(80)
    expect(words).toBeLessThanOrEqual(120)
    expect(copy!.intro).toContain('باشگاه بهناز')
    expect(copy!.intro).toContain('تهران')
    expect(copy!.intro).toContain('نیاوران')
    expect(copy!.intro).toContain('پدل')
    expect(copy!.intro).toContain('پارکینگ')
    expect(copy!.intro).toContain('اینباکس')
    expect(copy!.intro).toContain(base.pageUrl)
  })

  it('exposes the three required H2 headings', () => {
    const copy = buildClubCitationCopy(base)!
    expect(copy.sections.map((s) => s.heading)).toEqual([
      'آدرس و دسترسی',
      'ورزش‌ها و امکانات',
      'نحوه رزرو در اینباکس',
    ])
    expect(copy.sections.every((s) => s.body.length > 20)).toBe(true)
  })

  it('builds 5 citation-ready FAQs (40–80 words) naming اینباکس once and the club URL', () => {
    const copy = buildClubCitationCopy(base)!
    expect(copy.faqs).toHaveLength(5)
    for (const faq of copy.faqs) {
      const words = countWords(faq.answer)
      expect(words).toBeGreaterThanOrEqual(40)
      expect(words).toBeLessThanOrEqual(80)
      expect(faq.answer).toContain(base.pageUrl)
      const inboxMentions = faq.answer.match(/اینباکس/g) || []
      expect(inboxMentions.length).toBe(1)
    }
  })

  it('does not invent amenities, prices, or reviews when fields are missing', () => {
    const copy = buildClubCitationCopy({
      name: 'باشگاه ساده',
      city: 'تهران',
      sports: ['پدل'],
      pageUrl: 'https://inboxs.ir/clubs/simple',
    })!
    expect(copy.intro).not.toMatch(/پارکینگ|دوش|کافه/)
    expect(copy.intro).not.toMatch(/هزار تومان/)
    expect(copy.intro).not.toMatch(/امتیاز|نظر کاربران|۵ ستاره/)
    expect(copy.faqs.some((f) => /هزار تومان/.test(f.answer))).toBe(false)
    expect(copy.faqs.every((f) => !/ساختگی/.test(f.question))).toBe(true)
  })

  it('mentions hours and prices only when provided', () => {
    const withMeta = buildClubCitationCopy(base)!
    expect(withMeta.intro).toMatch(/۰۸:۰۰|08:00|ساعت/)
    expect(withMeta.intro).toContain('هزار تومان')

    const thin = buildClubCitationCopy({
      name: 'باشگاه نازک',
      pageUrl: 'https://inboxs.ir/clubs/thin',
      sports: ['تنیس'],
    })!
    expect(thin.intro).toContain('ساعات ثابت')
    expect(thin.intro).not.toContain('هزار تومان')
  })
})

describe('buildClubFaqPageJsonLd', () => {
  it('returns null for empty faqs', () => {
    expect(buildClubFaqPageJsonLd([])).toBeNull()
  })

  it('builds FAQPage JSON-LD matching LegalFaq shape', () => {
    const copy = buildClubCitationCopy(base)!
    const jsonLd = buildClubFaqPageJsonLd(copy.faqs, { url: base.pageUrl })
    expect(jsonLd).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      url: base.pageUrl,
    })
    expect(jsonLd?.mainEntity).toHaveLength(5)
    const first = (jsonLd?.mainEntity as Array<Record<string, unknown>>)[0]
    expect(first).toMatchObject({
      '@type': 'Question',
      name: copy.faqs[0]!.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: copy.faqs[0]!.answer,
      },
    })
  })

  it('serializes safely for script tags', () => {
    const raw = serializeJsonLd(
      buildClubFaqPageJsonLd([
        {
          question: 'سوال',
          answer: 'پاسخ </script><script>alert(1)</script>',
        },
      ])!,
    )
    expect(raw).not.toContain('</script>')
    expect(raw).toContain('\\u003c/script>')
  })
})
