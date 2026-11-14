import { describe, expect, it, vi } from 'vitest'
import {
  isSepSimulatedRef,
  isSepTokenSuccess,
  isSepVerifySuccess,
  sepBaseUrl,
  sepRequestToken,
  sepReverseTransaction,
  sepOnlinePgUrl,
  sepStartPayUrl,
  sepVerifyTransaction,
} from './sepClient'

describe('sepClient', () => {
  it('builds start-pay URL from token', () => {
    expect(sepStartPayUrl('tok-abc')).toBe(`${sepBaseUrl()}/OnlinePG/SendToken?token=tok-abc`)
  })

  it('builds POST OnlinePG action (preferred token handoff)', () => {
    expect(sepOnlinePgUrl()).toBe(`${sepBaseUrl()}/OnlinePG/OnlinePG`)
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

  it('verifyTransaction parses the real Saman body (no ResNum, OrginalAmount, TerminalNumber)', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      TransactionDetail: {
        RRN: '14226761817',
        RefNum: 'ref-1',
        MaskedPan: '621986****8080',
        HashedPan: 'x',
        TerminalNumber: 12345678,
        OrginalAmount: 25_000,
        AffectiveAmount: 25_000,
        StraceDate: '2026-11-14 13:58:00',
        StraceNo: '100428',
      },
      ResultCode: 0,
      ResultDescription: 'عملیات با موفقیت انجام شد',
      Success: true,
    }), { status: 200 })) as unknown as typeof fetch

    const result = await sepVerifyTransaction({ terminalId: '12345678', refNum: 'ref-1' }, fetchImpl)
    expect(result.resultCode).toBe(0)
    expect(result.amount).toBe(25_000)
    expect(result.resNum).toBeUndefined()
    expect(result.terminalNumber).toBe(12345678)
    expect(result.traceNo).toBe('100428')
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

  it('does not treat Success:true as a reverse when the result code failed', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ResultCode: -1,
      ResultDescription: 'denied',
      Success: true,
    }), { status: 200 })) as unknown as typeof fetch
    await expect(sepReverseTransaction({
      terminalId: '12345678',
      refNum: 'ref-1',
    }, fetchImpl)).rejects.toThrow(/reverse failed \(code=-1\)/)
  })

  it('keeps a success result code when Success is false', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ResultCode: 0,
      Success: false,
    }), { status: 200 })) as unknown as typeof fetch
    const result = await sepReverseTransaction({
      terminalId: '12345678',
      refNum: 'ref-ok',
    }, fetchImpl)
    expect(result.success).toBe(true)
    expect(result.resultCode).toBe(0)
  })

  it('reverseTransaction treats codes 0, 2, 5 as success (not verify semantics)', async () => {
    for (const code of [0, 2, 5]) {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
        ResultCode: code,
      }), { status: 200 })) as unknown as typeof fetch
      const result = await sepReverseTransaction({
        terminalId: '12345678',
        refNum: `ref-${code}`,
      }, fetchImpl)
      expect(result.success).toBe(true)
      expect(result.resultCode).toBe(code)
    }
  })
})
