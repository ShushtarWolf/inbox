import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./rateLimit', () => ({
  enforceOtpSendPhoneLimit: vi.fn(),
}))

const { isPhoneRegistered, findUserForAdditionalRole, sendSms } = vi.hoisted(() => ({
  isPhoneRegistered: vi.fn(),
  findUserForAdditionalRole: vi.fn(),
  sendSms: vi.fn(),
}))

vi.mock('./phoneAuth', () => ({
  findUserForPhoneOtp: vi.fn(),
  findUserForAdditionalRole,
  isPhoneRegistered,
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

describe('createAndSendPhoneOtp register existing athlete', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    prismaMock.phoneOtp.findFirst.mockResolvedValue(null)
    prismaMock.phoneOtp.updateMany.mockResolvedValue({ count: 0 })
    prismaMock.phoneOtp.create.mockResolvedValue({ id: 'otp1' })
    sendSms.mockResolvedValue(undefined)
  })

  it('returns ALREADY_REGISTERED_USE_LOGIN when phone cannot take another ATHLETE role', async () => {
    isPhoneRegistered.mockResolvedValue(true)
    findUserForAdditionalRole.mockResolvedValue(null)
    const { createAndSendPhoneOtp } = await import('./otp')
    await expect(createAndSendPhoneOtp({
      phoneRaw: '09121234567',
      purpose: 'register',
      role: 'ATHLETE',
      payload: { name: 'تست', gender: 'MALE' },
    })).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'ALREADY_REGISTERED_USE_LOGIN',
      data: { code: 'ALREADY_REGISTERED_USE_LOGIN' },
    })
    expect(prismaMock.phoneOtp.create).not.toHaveBeenCalled()
    expect(sendSms).not.toHaveBeenCalled()
  })
})