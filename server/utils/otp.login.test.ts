import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./rateLimit', () => ({
  enforceOtpSendPhoneLimit: vi.fn(),
}))

const { findUserForPhoneOtp, sendSms } = vi.hoisted(() => ({
  findUserForPhoneOtp: vi.fn(),
  sendSms: vi.fn(),
}))

vi.mock('./phoneAuth', () => ({
  findUserForPhoneOtp,
  findUserForAdditionalRole: vi.fn(),
  isPhoneRegistered: vi.fn(),
}))

vi.mock('./sms/service', () => ({
  sendSms,
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
vi.stubGlobal('createError', createError)

describe('createAndSendPhoneOtp login registration gate', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    prismaMock.phoneOtp.findFirst.mockResolvedValue(null)
    prismaMock.phoneOtp.updateMany.mockResolvedValue({ count: 0 })
    prismaMock.phoneOtp.create.mockResolvedValue({ id: 'otp1' })
    sendSms.mockResolvedValue(undefined)
  })

  it('returns PHONE_NOT_REGISTERED for login when the phone has no account', async () => {
    findUserForPhoneOtp.mockResolvedValue(null)
    const { createAndSendPhoneOtp } = await import('./otp')
    await expect(createAndSendPhoneOtp({
      phoneRaw: '09129998877',
      purpose: 'login',
    })).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'PHONE_NOT_REGISTERED',
    })
    expect(prismaMock.phoneOtp.create).not.toHaveBeenCalled()
    expect(sendSms).not.toHaveBeenCalled()
  })

  it('sends OTP on login when the phone is registered', async () => {
    findUserForPhoneOtp.mockResolvedValue({
      user: { id: 'u1' },
      linkPhone: false,
      phone: '09121234567',
    })
    const { createAndSendPhoneOtp } = await import('./otp')
    const result = await createAndSendPhoneOtp({
      phoneRaw: '09121234567',
      purpose: 'login',
    })
    expect(result.phone).toBe('09121234567')
    expect(prismaMock.phoneOtp.create).toHaveBeenCalled()
    expect(sendSms).toHaveBeenCalled()
  })
})