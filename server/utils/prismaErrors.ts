/** Thrown inside a Prisma transaction when a FREE-slot claim loses a race. */
export class SlotNotAvailableError extends Error {
  constructor(message = 'Slot not available') {
    super(message)
    this.name = 'SlotNotAvailableError'
  }
}

/** Prisma P2002 unique constraint violation (e.g. Booking.slotId race). */
export function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as { code: unknown }).code === 'P2002',
  )
}

export function rethrowSlotConflict(error: unknown): never {
  if (error instanceof SlotNotAvailableError || isUniqueConstraintError(error)) {
    throw createError({ statusCode: 409, statusMessage: 'Slot not available' })
  }
  throw error
}
