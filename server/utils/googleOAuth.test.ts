import { beforeEach, describe, expect, it, vi } from 'vitest'

const useRuntimeConfig = vi.fn()

vi.stubGlobal('useRuntimeConfig', useRuntimeConfig)
vi.stubGlobal('process', process)

import { getGoogleOAuthStatus } from './googleOAuth'

describe('getGoogleOAuthStatus', () => {
  beforeEach(() => {
    useRuntimeConfig.mockReset()
    delete process.env.NUXT_PUBLIC_SITE_URL
  })

  it('is disabled when client credentials are missing', () => {
    useRuntimeConfig.mockReturnValue({
      oauth: { google: { clientId: '', clientSecret: '', redirectURL: 'https://inboxs.ir/auth/google' } },
      public: { siteUrl: 'https://inboxs.ir' },
    })
    expect(getGoogleOAuthStatus().enabled).toBe(false)
  })

  it('uses explicit redirectURL when set', () => {
    useRuntimeConfig.mockReturnValue({
      oauth: {
        google: {
          clientId: 'id',
          clientSecret: 'secret',
          redirectURL: 'https://inboxs.ir/auth/google',
        },
      },
      public: { siteUrl: '' },
    })
    const status = getGoogleOAuthStatus()
    expect(status.enabled).toBe(true)
    expect(status.redirectURL).toBe('https://inboxs.ir/auth/google')
  })

  it('derives redirectURL from public.siteUrl when redirect unset', () => {
    useRuntimeConfig.mockReturnValue({
      oauth: { google: { clientId: 'id', clientSecret: 'secret', redirectURL: '' } },
      public: { siteUrl: 'https://inboxs.ir/' },
    })
    const status = getGoogleOAuthStatus()
    expect(status.enabled).toBe(true)
    expect(status.redirectURL).toBe('https://inboxs.ir/auth/google')
  })

  it('derives redirectURL from NUXT_PUBLIC_SITE_URL env fallback', () => {
    process.env.NUXT_PUBLIC_SITE_URL = 'http://localhost:3000'
    useRuntimeConfig.mockReturnValue({
      oauth: { google: { clientId: 'id', clientSecret: 'secret', redirectURL: '' } },
      public: {},
    })
    const status = getGoogleOAuthStatus()
    expect(status.enabled).toBe(true)
    expect(status.redirectURL).toBe('http://localhost:3000/auth/google')
  })
})
