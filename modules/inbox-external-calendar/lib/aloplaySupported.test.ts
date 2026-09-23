import { describe, expect, it } from 'vitest'
import { aloplaySupported } from '../runtime/server/lib/adapters/index'
import iust from '../mappings/iust-tennis.json'

describe('aloplaySupported', () => {
  it('IUST mapping pauses AloPlay via supported:false', () => {
    expect(aloplaySupported(iust as any)).toBe(false)
  })

  it('clubId alone still supports when not paused', () => {
    expect(
      aloplaySupported({
        inboxSlug: 'x',
        sources: { aloplay: { clubId: 1, clubTitle: 't' } },
      } as any),
    ).toBe(true)
  })

  it('explicit supported:false pauses AloPlay even with clubId', () => {
    expect(
      aloplaySupported({
        inboxSlug: 'x',
        sources: { aloplay: { clubId: 1, clubTitle: 't', supported: false } },
      } as any),
    ).toBe(false)
  })
})
