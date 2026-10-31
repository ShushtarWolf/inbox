/** Student identity verification for club discount programs (IUST 50% MVP). */

export const IUST_STUDENT_DISCOUNT_PERCENT = 50

export const STUDENT_NUMBER_MIN_LEN = 5
export const STUDENT_NUMBER_MAX_LEN = 20

/** Latin digits only — Persian digits in input are normalized first. */
export function normalizeStudentNumber(raw: string): string {
  const fa = '۰۱۲۳۴۵۶۷۸۹'
  let s = String(raw || '').trim()
  s = s.replace(/[۰-۹]/g, (ch) => String(fa.indexOf(ch)))
  return s.replace(/\D/g, '')
}

export function normalizeApplicantFullName(raw: string): string {
  return String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 120)
}

export type StudentVerificationFieldErrors = {
  fullName?: string
  studentNumber?: string
  proof?: string
  ownership?: string
}

export function validateStudentVerificationFields(opts: {
  fullName: string
  studentNumber: string
  proofCount: number
  ownershipConfirmed: boolean
}): StudentVerificationFieldErrors {
  const errors: StudentVerificationFieldErrors = {}
  const name = normalizeApplicantFullName(opts.fullName)
  if (name.length < 3) errors.fullName = 'FULL_NAME_REQUIRED'
  const num = normalizeStudentNumber(opts.studentNumber)
  if (num.length < STUDENT_NUMBER_MIN_LEN || num.length > STUDENT_NUMBER_MAX_LEN) {
    errors.studentNumber = 'STUDENT_NUMBER_INVALID'
  }
  if (opts.proofCount < 1) errors.proof = 'PROOF_REQUIRED'
  if (!opts.ownershipConfirmed) errors.ownership = 'OWNERSHIP_REQUIRED'
  return errors
}

export function studentVerificationFieldErrorsEmpty(errors: StudentVerificationFieldErrors): boolean {
  return !errors.fullName && !errors.studentNumber && !errors.proof && !errors.ownership
}
