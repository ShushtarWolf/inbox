import { describe, expect, it } from 'vitest'
import {
  normalizeApplicantFullName,
  normalizeStudentNumber,
  studentVerificationFieldErrorsEmpty,
  validateStudentVerificationFields,
} from './studentVerification'

describe('normalizeStudentNumber', () => {
  it('strips non-digits and Persian digits', () => {
    expect(normalizeStudentNumber('  ۴۰۱۱۲۳۴۵  ')).toBe('40112345')
    expect(normalizeStudentNumber('40-112-345')).toBe('40112345')
  })
})

describe('validateStudentVerificationFields', () => {
  it('requires all fields for student flow', () => {
    const errors = validateStudentVerificationFields({
      fullName: 'ع',
      studentNumber: '12',
      proofCount: 0,
      ownershipConfirmed: false,
    })
    expect(studentVerificationFieldErrorsEmpty(errors)).toBe(false)
    expect(errors.fullName).toBe('FULL_NAME_REQUIRED')
    expect(errors.studentNumber).toBe('STUDENT_NUMBER_INVALID')
    expect(errors.proof).toBe('PROOF_REQUIRED')
    expect(errors.ownership).toBe('OWNERSHIP_REQUIRED')
  })

  it('passes with valid payload', () => {
    const errors = validateStudentVerificationFields({
      fullName: 'علی رضایی',
      studentNumber: '4012345678',
      proofCount: 1,
      ownershipConfirmed: true,
    })
    expect(studentVerificationFieldErrorsEmpty(errors)).toBe(true)
  })
})

describe('normalizeApplicantFullName', () => {
  it('collapses whitespace', () => {
    expect(normalizeApplicantFullName('  علی   رضایی  ')).toBe('علی رضایی')
  })
})
