import { describe, expect, it } from 'vitest'
import { labelForFaqPath, splitFaqAnswerLinks } from './faqAnswerLinks.ts'

describe('splitFaqAnswerLinks', () => {
  it('returns plain text when there are no URLs', () => {
    expect(splitFaqAnswerLinks('فقط متن بدون لینک')).toEqual([
      { type: 'text', value: 'فقط متن بدون لینک' },
    ])
  })

  it('turns absolute inboxs.ir URLs into labeled link parts', () => {
    const parts = splitFaqAnswerLinks(
      'از https://inboxs.ir/clubs باشگاه را باز کنید و قیمت را در https://inboxs.ir/pricing ببینید.',
    )
    expect(parts).toEqual([
      { type: 'text', value: 'از ' },
      { type: 'link', href: 'https://inboxs.ir/clubs', path: '/clubs', label: 'فهرست باشگاه‌ها' },
      { type: 'text', value: ' باشگاه را باز کنید و قیمت را در ' },
      { type: 'link', href: 'https://inboxs.ir/pricing', path: '/pricing', label: 'قیمت‌ها' },
      { type: 'text', value: ' ببینید.' },
    ])
  })

  it('labels home and hub paths', () => {
    expect(labelForFaqPath('/')).toBe('صفحه اصلی')
    expect(labelForFaqPath('/clubs/tehran/padel')).toBe('زمین پدل تهران')
    expect(labelForFaqPath('/clubs/behnaz')).toBe('صفحه باشگاه')
  })

  it('leaves external URLs as plain text', () => {
    const parts = splitFaqAnswerLinks('ببینید https://example.com/x را')
    expect(parts).toEqual([{ type: 'text', value: 'ببینید https://example.com/x را' }])
  })
})
