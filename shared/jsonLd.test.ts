import { describe, expect, it } from 'vitest'
import { serializeJsonLd } from './jsonLd.ts'

describe('serializeJsonLd', () => {
  it('escapes script breakout sequences', () => {
    const raw = serializeJsonLd({ name: '</script><script>alert(1)</script>' })
    expect(raw).not.toContain('</script>')
    expect(raw).toContain('\\u003c/script>')
  })

  it('round-trips normal objects', () => {
    const data = { '@type': 'Place', name: 'باشگاه' }
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data)
  })
})
