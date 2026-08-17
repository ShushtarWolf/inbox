import { buildReturnTo } from '#shared/returnTo.ts'
import { canCoverBookingWithWallet } from '#shared/walletTopUp.ts'

/**
 * Shared court booking + checkout used by club-detail confirm sheet.
 * Legacy `/book/court/:slug` redirects to `/clubs/:slug` (query preserved).
 */
export function useCourtBooking() {
  const { t } = useI18n()
  const route = useRoute()
  const { user } = useAuth()
  const { openLogin } = useAuthFlow()
  const { fetchErrorMessage } = useFetchError()
  const { onlineEnabled, startCheckout, canPayOnline, canCoverWithWallet } = useCheckout()
  const { smsLive } = useSmsCapability()
  const { data: walletData, refresh: refreshWallet } = useAuthedFetch<{ balance?: number }>('/api/wallet', {
    immediate: false,
    watch: false,
  })

  const confirming = ref(false)
  const paying = ref(false)
  const feedback = ref('')
  const feedbackTone = ref<'success' | 'error'>('success')
  const createdBookingId = ref<string | null>(null)
  const createdBookingIds = ref<string[]>([])
  const lastPaymentStatus = ref<string | null>(null)
  const bookedTotal = ref<number | null>(null)
  const done = ref(false)

  const walletBalance = computed(() => Number(walletData.value?.balance || 0))

  watch(
    () => Boolean(user.value),
    (loggedIn) => {
      if (loggedIn) refreshWallet()
    },
    { immediate: true },
  )

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

  /** Deep-link back to club confirm sheet with the same date / court / slots. */
  function bookingReturnTo(opts?: {
    returnTo?: string
    date?: string
    courtId?: string
    courtIds?: string[]
    slotIds?: string[]
  }) {
    if (opts?.returnTo) return opts.returnTo
    const slotIds = [...new Set((opts?.slotIds || []).filter(Boolean))]
    if (!slotIds.length) return route.fullPath
    const courtIds = [...new Set((opts?.courtIds || []).filter(Boolean))]
    const court = courtIds.length
      ? courtIds.join(',')
      : (opts?.courtId || (typeof route.query.court === 'string' ? route.query.court : undefined))
    return buildReturnTo(route.path, {
      date: opts?.date || (typeof route.query.date === 'string' ? route.query.date : undefined),
      court,
      slots: slotIds.join(','),
    })
  }

  function gateGuestAuth(opts?: {
    returnTo?: string
    date?: string
    courtId?: string
    courtIds?: string[]
    slotIds?: string[]
    notice?: string
  }) {
    if (user.value) return false
    openLogin({
      returnTo: bookingReturnTo(opts),
      notice: opts?.notice || t('booking.loginToConfirmNotice'),
      smsLive: smsLive.value,
    })
    return true
  }

  function canPayWithWallet(amount?: number | null, paymentStatus?: string | null) {
    return canCoverWithWallet(walletBalance.value, amount ?? bookedTotal.value, paymentStatus || lastPaymentStatus.value)
  }

  /** Pre-booking: balance covers amount (no payment row yet). */
  function walletCoversAmount(amount?: number | null) {
    return canCoverBookingWithWallet(walletBalance.value, Number(amount || 0))
  }

  async function createCourtBookings(opts: {
    slotIds: string[]
    equipmentIds?: string[]
    equipmentQuantities?: Record<string, number>
    discountCode?: string
    returnTo?: string
    date?: string
    courtId?: string
    courtIds?: string[]
    preferWallet?: boolean
  }) {
    const slotIds = [...new Set(opts.slotIds.filter(Boolean))]
    if (!slotIds.length || confirming.value) return null

    if (gateGuestAuth({
      returnTo: opts.returnTo,
      date: opts.date,
      courtId: opts.courtId,
      courtIds: opts.courtIds,
      slotIds,
    })) {
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
        discountAmount?: number
        discountCode?: string | null
      }>('/api/bookings/court', {
        method: 'POST',
        body: {
          slotIds,
          slotId: slotIds[0],
          equipmentIds: opts.equipmentIds?.length ? opts.equipmentIds : undefined,
          equipmentQuantities: opts.equipmentQuantities && Object.keys(opts.equipmentQuantities).length
            ? opts.equipmentQuantities
            : undefined,
          discountCode: opts.discountCode || undefined,
        },
      })

      createdBookingId.value = result.id
      createdBookingIds.value = result.bookingIds?.length ? result.bookingIds : [result.id]
      lastPaymentStatus.value = result.paymentStatus
      bookedTotal.value = result.totalAmount ?? null
      done.value = true
      feedbackTone.value = 'success'
      feedback.value = onlineEnabled.value ? t('booking.successCourtOnline') : t('booking.successCourt')

      const amount = result.totalAmount ?? 0
      const useWallet = Boolean(
        opts.preferWallet
        && canCoverWithWallet(walletBalance.value, amount, result.paymentStatus),
      )

      if (useWallet) {
        paying.value = true
        try {
          await startCheckout({ bookingId: result.id, useWallet: true })
          lastPaymentStatus.value = 'PAID'
          feedback.value = t('booking.walletPaidSuccess')
          await refreshWallet()
        }
        catch (checkoutError: unknown) {
          feedbackTone.value = 'error'
          feedback.value = fetchErrorMessage(checkoutError, t('booking.paymentError'))
        }
        finally {
          paying.value = false
        }
      } else if (onlineEnabled.value && canPayOnline(result.paymentStatus)) {
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
    if (!user.value) return t('booking.loginToContinue')
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
    walletBalance,
    resetBookingState,
    bookingReturnTo,
    gateGuestAuth,
    createCourtBookings,
    payBooking,
    payBookingWithWallet,
    canPayWithWallet,
    walletCoversAmount,
    primaryCtaLabel,
  }
}
