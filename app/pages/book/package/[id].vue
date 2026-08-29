<script setup lang="ts">
/**
 * Soft-land when class packages are off; otherwise load OPEN package detail for booking.
 */
import { fetchErrorMessage } from '~/composables/useFetchError'

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { packagesEnabled } = usePilotFlags()
const { formatCurrency } = useFormatters()
const { startCheckout, onlineEnabled } = useCheckout()
const { user } = useAuth()

const id = computed(() => String(route.params.id || ''))

const { data: pkg, pending, error, refresh } = await useAsyncData(
  () => `package-${id.value}`,
  () => packagesEnabled.value
    ? $fetch<{
      title: string
      price: number
      discount: number
      seatsLeft: number
    }>(`/api/packages/${id.value}`)
    : Promise.resolve(null),
  { watch: [id, packagesEnabled] },
)

const booking = ref<{ id: string; paymentStatus: string } | null>(null)
const actionError = ref('')
const busy = ref(false)

async function bookSeat() {
  if (!user.value) {
    await navigateTo(localePath('/login'))
    return
  }
  busy.value = true
  actionError.value = ''
  try {
    booking.value = await $fetch('/api/bookings/package', {
      method: 'POST',
      body: { packageId: id.value },
    })
  }
  catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  }
  finally {
    busy.value = false
  }
}

async function pay(useWallet = false) {
  if (!booking.value) return
  busy.value = true
  actionError.value = ''
  try {
    await startCheckout({ packageBookingId: booking.value.id, useWallet })
    await refresh()
  }
  catch (err: unknown) {
    actionError.value = fetchErrorMessage(err, t('booking.actionFailed'))
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg space-y-4 px-4 py-4">
    <template v-if="!packagesEnabled">
      <CanvaSubpageHeader to="/clubs" :title="t('booking.packageDisabled.title')" />
      <p class="text-sm text-brand-gray-600">{{ t('booking.packageDisabled.body') }}</p>
      <NuxtLink
        :to="localePath('/clubs')"
        class="canva-cta inline-flex w-full items-center justify-center px-4 py-3 text-sm font-bold"
        style="border-radius: var(--sz-canva-radius);"
      >
        {{ t('booking.packageDisabled.cta') }}
      </NuxtLink>
    </template>

    <AppAsyncState v-else :pending="pending" :error="error" @retry="refresh">
      <CanvaSubpageHeader to="/clubs" :title="pkg?.title || t('owner.packages')" />
      <div v-if="pkg" class="space-y-3 text-start">
        <p class="text-sm text-brand-gray-600">
          {{ formatCurrency(Math.max(0, pkg.price - (pkg.discount || 0))) }}
          · {{ t('owner.packagesPage.spotsRemaining', { count: pkg.seatsLeft }) }}
        </p>
        <p v-if="actionError" class="text-sm text-brand-error">{{ actionError }}</p>
        <button
          v-if="!booking"
          type="button"
          class="canva-cta inline-flex w-full items-center justify-center px-4 py-3 text-sm font-bold"
          style="border-radius: var(--sz-canva-radius);"
          :disabled="busy || pkg.seatsLeft <= 0"
          @click="bookSeat"
        >
          {{ t('booking.confirm') }}
        </button>
        <template v-else>
          <p class="text-sm font-bold text-brand-navy">{{ t('booking.payAtClubDetail') }}</p>
          <button
            v-if="onlineEnabled"
            type="button"
            class="canva-cta inline-flex w-full items-center justify-center px-4 py-3 text-sm font-bold"
            style="border-radius: var(--sz-canva-radius);"
            :disabled="busy"
            @click="pay(false)"
          >
            {{ t('booking.payNow') }}
          </button>
          <button
            type="button"
            class="canva-cta inline-flex w-full items-center justify-center px-4 py-3 text-sm font-bold"
            style="border-radius: var(--sz-canva-radius);"
            :disabled="busy"
            @click="pay(true)"
          >
            {{ t('booking.payWithWallet') }}
          </button>
        </template>
      </div>
    </AppAsyncState>
  </div>
</template>
