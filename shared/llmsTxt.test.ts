import { describe, expect, it } from 'vitest'
import { buildLlmsTxt } from './llmsTxt.ts'

describe('buildLlmsTxt', () => {
  it('includes brand, booking, owner apply, and Tehran hubs', () => {
    const text = buildLlmsTxt({ siteUrl: 'https://inboxs.ir' })
    expect(text).toContain('اینباکس چیست')
    expect(text).toContain('برای چه کسانی است')
    expect(text).toContain('چطور رزرو کنم')
    expect(text).toContain('ثبت باشگاه')
    expect(text).toContain('/clubs/apply')
    expect(text).toContain('## شهر و ورزش')
    expect(text).toContain('/clubs/tehran/padel')
    expect(text).toContain('/clubs/tehran/tennis')
    expect(text).toContain('زمین پدل تهران')
    expect(text).toContain('## باشگاه‌ها')
  })

  it('lists each ACTIVE club with one factual line', () => {
    const text = buildLlmsTxt({
      clubs: [
        {
          slug: 'iust-tennis',
          nameFa: 'دانشگاه علم و صنعت',
          city: 'تهران',
          district: 'رسالت',
          sports: ['تنیس'],
        },
        {
          slug: 'behnaz',
          nameFa: 'باشگاه بهناز',
          city: 'تهران',
          sports: ['پدل', 'تنیس'],
        },
      ],
    })
    expect(text).toContain('[دانشگاه علم و صنعت](https://inboxs.ir/clubs/iust-tennis)')
    expect(text).toContain('محله رسالت')
    expect(text).toContain('[باشگاه بهناز](https://inboxs.ir/clubs/behnaz)')
    expect(text).toMatch(/پدل.*تنیس|تنیس.*پدل/)
  })

  it('adds مربیان section only when coaches exist', () => {
    const without = buildLlmsTxt({ clubs: [] })
    expect(without).not.toContain('## مربیان')

    const withCoaches = buildLlmsTxt({
      coaches: [{ path: '/coaches/behnaz-taabodi', nameFa: 'بهناز تعبدی', city: 'تهران' }],
    })
    expect(withCoaches).toContain('## مربیان')
    expect(withCoaches).toContain('/coaches/behnaz-taabodi')
    expect(withCoaches).toContain('بهناز تعبدی')
  })
})
