import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { countWords } from './clubCitationCopy.ts'

type FaqItem = { question: string; answer: string }

const faPath = join(dirname(fileURLToPath(import.meta.url)), '../i18n/locales/fa.json')
const fa = JSON.parse(readFileSync(faPath, 'utf8')) as {
  legal: { sitewideFaq: FaqItem[] }
}

const REQUIRED_TOPICS = [
  'رزرو کنم',
  'پرداخت',
  'لغو',
  'باشگاه پدل یا تنیس مناسب',
  'پدل تهران',
  'تنیس تهران',
  'کارمزد',
  'صاحب باشگاه',
] as const

describe('legal.sitewideFaq', () => {
  it('has 8 citation-ready answers (40–80 words) naming اینباکس + inboxs.ir once', () => {
    const faqs = fa.legal.sitewideFaq
    expect(faqs).toHaveLength(8)

    for (const topic of REQUIRED_TOPICS) {
      expect(faqs.some((faq) => faq.question.includes(topic))).toBe(true)
    }

    for (const faq of faqs) {
      const words = countWords(faq.answer)
      expect(words, faq.question).toBeGreaterThanOrEqual(40)
      expect(words, faq.question).toBeLessThanOrEqual(80)
      expect(faq.answer.match(/اینباکس/g) || []).toHaveLength(1)
      expect(faq.answer.match(/inboxs\.ir/g) || []).toHaveLength(1)
    }
  })
})
