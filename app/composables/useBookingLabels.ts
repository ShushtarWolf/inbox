/** Shared booking / payment status labels and badge classes for athlete surfaces. */
export function useBookingLabels() {
  const { t } = useI18n()
  const { public: { paymentsMode } } = useRuntimeConfig()
  const payAtClubMode = computed(() => paymentsMode === 'pay_at_club')

  function bookingStatusLabel(status?: string | null) {
    if (!status) return ''
    return t(`booking.status.${status}`)
  }

  function paymentStatusLabel(status?: string | null) {
    if (!status) return t('booking.paymentStatus.NOT_PAID')
    return t(`booking.paymentStatus.${status}`)
  }

  function bookingStatusBadgeClass(status?: string | null) {
    if (status === 'CONFIRMED') return 'tail-badge-success'
    if (status === 'CANCELLED') return 'tail-badge-danger'
    if (status === 'PENDING') return 'tail-badge-warning'
    return 'tail-badge-gray'
  }

  function paymentStatusBadgeClass(status?: string | null) {
    if (status === 'PAID') return 'tail-badge-success'
    if (status === 'REFUNDED') return 'tail-badge-gray'
    if (status === 'FAILED') return 'tail-badge-danger'
    if (status === 'PAY_AT_CLUB' || status === 'PENDING_AT_CLUB' || status === 'PENDING_ONLINE' || status === 'NOT_PAID') {
      return 'tail-badge-warning'
    }
    return 'tail-badge-gray'
  }

  function isPayAtClubStatus(status?: string | null) {
    return status === 'PAY_AT_CLUB' || status === 'PENDING_AT_CLUB'
  }

  function cancelRefundNote() {
    return payAtClubMode.value ? t('booking.cancelRefundNotePayAtClub') : t('booking.cancelRefundNote')
  }

  return {
    payAtClubMode,
    bookingStatusLabel,
    paymentStatusLabel,
    bookingStatusBadgeClass,
    paymentStatusBadgeClass,
    isPayAtClubStatus,
    cancelRefundNote,
  }
}
