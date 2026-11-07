import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./rateLimit', () => ({
  enforceOtpSendPhoneLimit: vi.fn(),
}))

vi.mock('./phoneAuth', () => ({
  findUserForPhoneOtp: vi.fn(async () => ({ user: { id: 'u1' }, role: 'ATHLETE' })),
  findUserForAdditionalRole: vi.fn(),
  isPhoneRegistered: vi.fn(),
}))

vi.mock('./sms/service', () => ({
  sendSms: vi.fn(),
}))

vi.mock('./sms/templates', () => ({
  renderOtpSms: vi.fn((code: string) => code),
}))

vi.mock('./password', () => ({
  hashSecret: vi.fn((v: string) => v),
  verifySecret: vi.fn(),
}))

const prismaMock = {
  phoneOtp: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
}

vi.stubGlobal('prisma', prismaMock)

describe('resolveOtpResendCooldownMs', () => {
  it('keeps the 60s default and honors an explicit zero', async () => {
    const { resolveOtpResendCooldownMs } = await import('./otp')
    expect(resolveOtpResendCooldownMs(undefined)).toBe(60_000)
    expect(resolveOtpResendCooldownMs('')).toBe(60_000)
    expect(resolveOtpResendCooldownMs('0')).toBe(0)
    expect(resolveOtpResendCooldownMs('15000')).toBe(15_000)
    expect(resolveOtpResendCooldownMs('nope')).toBe(60_000)
    expect(resolveOtpResendCooldownMs('-1')).toBe(60_000)
  })
})

describe('createAndSendPhoneOtp resend cooldown', () => {
  beforeEach(() => {
    vi.stubEnv('OTP_RESEND_COOLDOWN_MS', '60000')
    vi.resetModules()
    vi.clearAllMocks()
    prismaMock.phoneOtp.updateMany.mockResolvedValue({ count: 0 })
    prismaMock.phoneOtp.create.mockResolvedValue({ id: 'otp1' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects when the last send was within the cooldown window', async () => {
    prismaMock.phoneOtp.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 15_000),
    })
    const { createAndSendPhoneOtp, OtpResendCooldownError } = await import('./otp')
    await expect(createAndSendPhoneOtp({
      phoneRaw: '09121234567',
      purpose: 'login',
    })).rejects.toBeInstanceOf(OtpResendCooldownError)
    expect(prismaMock.phoneOtp.create).not.toHaveBeenCalled()
  })

  it('allows send when the cooldown window has passed', async () => {
    prismaMock.phoneOtp.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 120_000),
    })
    const { createAndSendPhoneOtp } = await import('./otp')
    const result = await createAndSendPhoneOtp({
      phoneRaw: '09121234567',
      purpose: 'login',
    })
    expect(result.phone).toBe('09121234567')
    expect(prismaMock.phoneOtp.create).toHaveBeenCalled()
  })

  it('allows immediate resend when OTP_RESEND_COOLDOWN_MS is 0', async () => {
    vi.stubEnv('OTP_RESEND_COOLDOWN_MS', '0')
    vi.resetModules()
    prismaMock.phoneOtp.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 1_000),
    })
    const { createAndSendPhoneOtp } = await import('./otp')
    await expect(createAndSendPhoneOtp({
      phoneRaw: '09121234567',
      purpose: 'login',
    })).resolves.toMatchObject({ phone: '09121234567' })
  })
})
