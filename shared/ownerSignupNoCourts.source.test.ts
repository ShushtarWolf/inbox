import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const files = {
  ownerClubCreate: readFileSync(new URL('../server/utils/ownerClubCreate.ts', import.meta.url), 'utf8'),
  registerOwner: readFileSync(new URL('../server/api/auth/register-owner.post.ts', import.meta.url), 'utf8'),
  otpVerify: readFileSync(new URL('../server/api/auth/otp/verify.post.ts', import.meta.url), 'utf8'),
  pendingPage: readFileSync(new URL('../app/pages/owner/pending.vue', import.meta.url), 'utf8'),
}

describe('owner signup — no default courts', () => {
  it('does not auto-create courts in club creation helpers', () => {
    for (const [name, src] of Object.entries(files)) {
      if (name === 'pendingPage') continue
      expect(src, name).not.toMatch(/court\.create\s*\(/)
    }
  })

  it('does not show setup CTA on pending page', () => {
    expect(files.pendingPage).not.toContain('/owner/setup')
    expect(files.pendingPage).not.toContain('pendingSetupCta')
  })
})