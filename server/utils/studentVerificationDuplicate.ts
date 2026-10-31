import { normalizeStudentNumber } from '#shared/studentVerification.ts'

/** Block another user holding an APPROVED student number at this club. */
export async function findApprovedStudentNumberConflict(opts: {
  clubId: string
  studentNumber: string
  excludeUserId?: string
  excludeApplicationId?: string
}) {
  const studentNumber = normalizeStudentNumber(opts.studentNumber)
  if (!studentNumber) return null

  const row = await prisma.discountApplication.findFirst({
    where: {
      clubId: opts.clubId,
      studentNumber,
      status: 'APPROVED',
      ...(opts.excludeUserId ? { userId: { not: opts.excludeUserId } } : {}),
      ...(opts.excludeApplicationId ? { id: { not: opts.excludeApplicationId } } : {}),
    },
    select: {
      id: true,
      userId: true,
      fullName: true,
      studentNumber: true,
    },
  })
  return row
}

export async function assertNoApprovedStudentNumberConflict(opts: {
  clubId: string
  studentNumber: string
  excludeUserId?: string
  excludeApplicationId?: string
}) {
  const conflict = await findApprovedStudentNumberConflict(opts)
  if (conflict) {
    throw createError({
      statusCode: 409,
      statusMessage: 'STUDENT_NUMBER_ALREADY_APPROVED',
    })
  }
}
