/** Subtotal that desk discount and confirm-step totals apply to (create vs edit). */
export function seasonConfirmChargeSubtotal(opts: {
  editingSeasonId: boolean
  editAddedAmount: number | null | undefined
  createSubtotal: number
}): number {
  if (opts.editingSeasonId) return Math.max(0, Math.round(Number(opts.editAddedAmount) || 0))
  return Math.max(0, Math.round(opts.createSubtotal))
}

export function seasonEditSaveOnly(opts: {
  editingSeasonId: boolean
  addedCount: number | null | undefined
}): boolean {
  return Boolean(opts.editingSeasonId) && Math.max(0, Number(opts.addedCount) || 0) === 0
}