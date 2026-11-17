import { describe, expect, it } from 'vitest'
import { ownerWithdrawAmountIssue } from './ownerWithdrawAmount.ts'

describe('ownerWithdrawAmountIssue', () => {
  it('returns null for empty input', () => {
    expect(ownerWithdrawAmountIssue(null, 100_000)).toBeNull()
  })

  it('flags non-positive amounts', () => {
    expect(ownerWithdrawAmountIssue(0, 100_000)).toBe('invalid')
    expect(ownerWithdrawAmountIssue(-1, 100_000)).toBe('invalid')
  })

  it('flags over-withdrawable amounts', () => {
    expect(ownerWithdrawAmountIssue(100_001, 100_000)).toBe('over')
    expect(ownerWithdrawAmountIssue(100_000, 100_000)).toBeNull()
  })
})