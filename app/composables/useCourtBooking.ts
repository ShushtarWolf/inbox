/**
 * Shared court booking + checkout used by club-detail confirm sheet
 * and `/book/court` deep-link fallback.
 */
export function useCourtBooking() {
  const { t } = useI18n()
  const route = useRoute()
  const { user } = useAuth()
  const { openLogin } = useAuthFlow()
  const { fetchErrorMessage } = useFetchError()
  const { onlineEnabled, startCheckout, canPayOnline } = useCheckout()

  const confirming = ref(false)
  const paying = ref(false)
  const feedback = ref('')
  const feedbackTone = ref<'success' | 'error'>('success')
  const createdBookingId = ref<string | null>(null)
  const createdBookingIds = ref<string[]>([])
  const lastPaymentStatus = ref<string | null>(null)
  const bookedTotal = ref<number | null>(null)
  const done = ref(false)

  function resetBookingState() {
    confirming.value = false
    paying.value = false
    feedback.value = ''
    feedbackTone.value = 'success'
    createdBookingId.value = null
    createdBookingIds.value = []
    lastPaymentStatus.value = null
    bookedTotal.value = null
    done.value = false
  }

  async function createCourtBookings(opts: {
    slotIds: string[]
    equipmentIds?: string[]
    returnTo?: string
  }) {
    const slotIds = [...new Set(opts.slotIds.filter(Boolean))]
    if (!slotIds.length || confirming.value) return null

    if (!user.value) {
      openLogin({ returnTo: opts.returnTo || route.fullPath })
      return null
    }

    confirming.value = true
    feedback.value = ''
    try {
      const result = await $fetch<{
        id: string
        paymentStatus: string
        bookingIds?: string[]
        totalAmount?: number
      }>('/api/bookings/court', {
        method: 'POST',
        body: {
          slotIds,
          slotId: slotIds[0],
          equipmentIds: opts.equipmentIds?.length ? opts.equipmentIds : undefined,
        },
      })

      createdBookingId.value = result.id
      createdBookingIds.value = result.bookingIds?.length ? result.bookingIds : [result.id]
      lastPaymentStatus.value = result.paymentStatus
      bookedTotal.value = result.totalAmount ?? null
      done.value = true
      feedbackTone.value = 'success'
      feedback.value = onlineEnabled.value ? t('booking.successCourtOnline') : t('booking.successCourt')

      if (onlineEnabled.value && canPayOnline(result.paymentStatus)) {
        paying.value = true
        try {
          await startCheckout({ bookingId: result.id })
        }
        catch (checkoutError: unknown) {
          feedbackTone.value = 'error'
          feedback.value = fetchErrorMessage(checkoutError, t('booking.paymentError'))
        }
        finally {
          paying.value = false
        }
      }

      return result
    }
    catch (error: unknown) {
      feedbackTone.value = 'error'
      feedback.value = fetchErrorMessage(error, t('booking.actionFailed'))
      return null
    }
    finally {
      confirming.value = false
    }
  }

  async function payBooking(bookingId?: string | null) {
    const id = bookingId || createdBookingId.value
    if (!id) return
    paying.value = true
    try {
      await startCheckout({ bookingId: id })
      feedbackTone.value = 'success'
      feedback.value = t('booking.payNow')
    }
    catch (error: unknown) {
      feedbackTone.value = 'error'
      feedback.value = fetchErrorMessage(error, t('booking.actionFailed'))
    }
    finally {
      paying.value = false
    }
  }

  async function payBookingWithWallet(bookingId?: string | null) {
    const id = bookingId || createdBookingId.value
    if (!id) return
    paying.value = true
    try {
      await startCheckout({ bookingId: id, useWallet: true })
      feedbackTone.value = 'success'
      feedback.value = t('booking.walletPaidSuccess')
    }
    catch (error: unknown) {
      feedbackTone.value = 'error'
      feedback.value = fetchErrorMessage(error, t('booking.actionFailed'))
    }
    finally {
      paying.value = false
    }
  }

  const primaryCtaLabel = computed(() => {
    if (confirming.value || paying.value) return t('common.loading')
    if (onlineEnabled.value) return t('booking.pay')
    return t('booking.confirmPayAtClub')
  })

  return {
    confirming,
    paying,
    feedback,
    feedbackTone,
    createdBookingId,
    createdBookingIds,
    lastPaymentStatus,
    bookedTotal,
    done,
    onlineEnabled,
    resetBookingState,
    createCourtBookings,
    payBooking,
    payBookingWithWallet,
    primaryCtaLabel,
  }
}
