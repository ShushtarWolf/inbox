import { describe, expect, it } from 'vitest'
import { bindSepVerify } from './sepVerifyBind.ts'

const base = {
  expectedResNum: 'INBorder',
  expectedRials: 1_000_000,
  expectedToman: 100_000,
  refNum: 'bank-ref-1',
  storedGatewayRef: null as string | null,
  storedVerifiedRials: null as number | null,
}

describe('bindSepVerify', () => {
  it('pays when the first verify echoes our ResNum and the rial amount', () => {
    expect(bindSepVerify({
      ...base,
      resultCode: 0,
      resNum: 'INBorder',
      amountRials: 1_000_000,
    })).toEqual({ action: 'paid' })
  })

  it('pays a duplicate callback (code 2) only for the same order and amount', () => {
    expect(bindSepVerify({
      ...base,
      resultCode: 2,
      resNum: 'INBorder',
      amountRials: 1_000_000,
    })).toEqual({ action: 'paid' })
  })

  it('rejects a replay of someone else’s RefNum even when the amount matches', () => {
    expect(bindSepVerify({
      ...base,
      resultCode: 2,
      resNum: 'INBother',
      amountRials: 1_000_000,
    })).toEqual({ action: 'reject_foreign' })
  })

  it('pays a real SEP verify body (no ResNum echo) when terminal and rial amount match', () => {
    // Saman TransactionDetail has no ResNum; this is what production receives.
    expect(bindSepVerify({
      ...base,
      resultCode: 0,
      resNum: undefined,
      amountRials: 1_000_000,
      terminalNumber: 12345678,
      expectedTerminal: 12345678,
    })).toEqual({ action: 'paid' })
    expect(bindSepVerify({
      ...base,
      resultCode: 2,
      resNum: '',
      amountRials: 1_000_000,
    })).toEqual({ action: 'paid' })
  })

  it('rejects a no-ResNum body from another terminal', () => {
    expect(bindSepVerify({
      ...base,
      resultCode: 0,
      resNum: undefined,
      amountRials: 1_000_000,
      terminalNumber: 999,
      expectedTerminal: 12345678,
    })).toEqual({ action: 'reject_foreign' })
  })

  it('never reverses a no-ResNum body with the wrong amount unless the RefNum is already ours', () => {
    expect(bindSepVerify({
      ...base,
      resultCode: 0,
      resNum: undefined,
      amountRials: 50_000,
    })).toEqual({ action: 'reject_foreign' })
    expect(bindSepVerify({
      ...base,
      resultCode: 0,
      resNum: undefined,
      amountRials: 50_000,
      storedGatewayRef: 'bank-ref-1',
    })).toEqual({ action: 'reverse_ours' })
  })

  it('a no-ResNum body without amount pays only when this row already owns the RefNum', () => {
    expect(bindSepVerify({
      ...base,
      resultCode: 2,
      resNum: null,
      amountRials: null,
    })).toEqual({ action: 'retry_incomplete' })

    expect(bindSepVerify({
      ...base,
      resultCode: 2,
      resNum: null,
      amountRials: null,
      storedGatewayRef: 'bank-ref-1',
      storedVerifiedRials: 1_000_000,
    })).toEqual({ action: 'paid' })
  })

  it('does not pay when the amount field is missing', () => {
    expect(bindSepVerify({
      ...base,
      resultCode: 0,
      resNum: 'INBorder',
      amountRials: null,
    })).toEqual({ action: 'retry_incomplete' })
  })

  it('reverses our capture when the bank amount is not the expected rials', () => {
    expect(bindSepVerify({
      ...base,
      resultCode: 0,
      resNum: 'INBorder',
      amountRials: 100_000,
    })).toEqual({ action: 'reverse_ours' })
  })

  it('does not reverse a foreign capture that also has the wrong amount', () => {
    expect(bindSepVerify({
      ...base,
      resultCode: 0,
      resNum: 'INBother',
      amountRials: 50,
    })).toEqual({ action: 'reject_foreign' })
  })

  it('treats a non-success result code as a definitive decline', () => {
    expect(bindSepVerify({
      ...base,
      resultCode: -1,
      resNum: 'INBorder',
      amountRials: 1_000_000,
    })).toEqual({ action: 'declined' })
  })
})
