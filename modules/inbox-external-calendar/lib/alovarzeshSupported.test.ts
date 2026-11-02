import { describe, expect, it } from 'vitest'
import { alovarzeshSupported } from '../runtime/server/lib/adapters/index'
import iust from '../mappings/iust-tennis.json'

describe('alovarzeshSupported', () => {
  it('IUST mapping pauses AloVarzesh via supported:false', () => {
    expect(alovarzeshSupported(iust as any)).toBe(false)
  })

  it('productId mapping supports when not paused', () => {
    expect(
      alovarzeshSupported({
        inboxSlug: 'x',
        sources: { alovarzesh: { clubTitle: 't' } },
        courts: [{ inboxCourtName: 'c1', external: { alovarzesh: { productId: 2796 } } }],
      } as any),
    ).toBe(true)
  })

  it('explicit supported:false pauses AloVarzesh even with productIds', () => {
    expect(
      alovarzeshSupported({
        inboxSlug: 'x',
        sources: { alovarzesh: { clubTitle: 't', supported: false } },
        courts: [{ inboxCourtName: 'c1', external: { alovarzesh: { productId: 2796 } } }],
      } as any),
    ).toBe(false)
  })
})
