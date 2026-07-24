import { describe, expect, it, vi } from 'vitest'
import {
  isSepSimulatedRef,
  isSepTokenSuccess,
  isSepVerifySuccess,
  sepBaseUrl,
  sepRequestToken,
  sepReverseTransaction,
  sepStartPayUrl,
  sepVerifyTransaction,
} from './sepClient'

describe('sepClient', () => {
  it('builds start-pay URL from token', () => {
    expect(sepStartPayUrl('tok-abc')).toBe(`${sepBaseUrl()}/OnlinePG/SendToken?token=tok-abc`)
  })

  it('treats verify codes 0 and 2 as success (idempotent)', () => {
    expect(isSepVerifySuccess(0)).toBe(true)
    expect(isSepVerifySuccess(2)).toBe(true)
    expect(isSepVerifySuccess(-1)).toBe(false)
    expect(isSepTokenSuccess(1, 't')).toBe(true)
    expect(isSepTokenSuccess(0, 't')).toBe(false)
    expect(isSepTokenSuccess(1, '')).toBe(false)
  })

  it('detects simulated refs without calling the network', () => {
    expect(isSepSimulatedRef('SIMabc')).toBe(true)
    expect(isSepSimulatedRef('sep-test-deadbeef')).toBe(true)
    expect(isSepSimulatedRef('INBabcdef')).toBe(false)
  })

  it('requestToken parses token from envelope', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      status: 1,
      token: 'sep-token-123',
      errorCode: '0',
      errorDesc: 'Success',
    }), { status: 200 })) as unknown as typeof fetch

    const result = await sepRequestToken({
      terminalId: '12345678',
      amount: 100_000,
      resNum: 'INBtest',
      redirectUrl: 'http://localhost:3000/payments/callback/sep',
    }, fetchImpl)

    expect(result.token).toBe('sep-token-123')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({
      action: 'token',
      TerminalId: '12345678',
      Amount: 100_000,
      ResNum: 'INBtest',
    })
  })

  it('verifyTransaction returns idempotent success code 2', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ResultCode: 2,
      ResultDescription: 'Verified',
      Success: true,
      TransactionDetail: { Amount: 50_000, ResNum: 'INB1', MaskedPan: '6037-****-1234' },
    }), { status: 200 })) as unknown as typeof fetch

    const result = await sepVerifyTransaction({
      terminalId: '12345678',
      refNum: 'ref-1',
    }, fetchImpl)

    expect(result.resultCode).toBe(2)
    expect(isSepVerifySuccess(result.resultCode)).toBe(true)
    expect(result.amount).toBe(50_000)
  })

  it('reverseTransaction requires success', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ResultCode: -1,
      ResultDescription: 'denied',
      Success: false,
    }), { status: 200 })) as unknown as typeof fetch

    await expect(sepReverseTransaction({
      terminalId: '12345678',
      refNum: 'ref-1',
    }, fetchImpl)).rejects.toThrow(/reverse failed/)
  })
})
