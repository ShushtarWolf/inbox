<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const slug = route.params.slug as string
const { user, fetch: fetchAuth } = useAuth()
const { localizedField } = useLocalizedField()
const { formatCurrency } = useFormatters()

const date = ref(new Date().toISOString().slice(0, 10))
const selectedSlot = ref<string | null>(null)
const done = ref(false)
const feedback = ref('')
const feedbackTone = ref<'success' | 'error'>('success')

const { data: slots, refresh } = await useFetch('/api/slots/available', {
  query: computed(() => ({ club: slug, date: date.value })),
})
const { data: club } = await useFetch(`/api/clubs/${slug}`)
const joiningWaitlist = ref(false)

async function confirm() {
  if (!selectedSlot.value) return
  if (!user.value) {
    await navigateTo(localePath('/login'))
    return
  }
  try {
    await $fetch('/api/bookings/court', { method: 'POST', body: { slotId: selectedSlot.value } })
    done.value = true
    feedbackTone.value = 'success'
    feedback.value = t('booking.successCourt')
    refresh()
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = error?.data?.statusMessage || t('booking.actionFailed')
  }
}

async function joinWaitlist() {
  joiningWaitlist.value = true
  try {
    await $fetch('/api/waitlist', {
      method: 'POST',
      body: {
        clubSlug: slug,
        date: date.value,
        startTime: '20:00',
        endTime: '21:00',
        guestName: user.value?.name,
        guestMobile: user.value?.phone,
      },
    })
    feedbackTone.value = 'success'
    feedback.value = t('booking.waitlistJoined')
  } catch (error: any) {
    feedbackTone.value = 'error'
    feedback.value = error?.data?.statusMessage || t('booking.actionFailed')
  } finally {
    joiningWaitlist.value = false
  }
}

onMounted(() => fetchAuth())
</script>

<template>
  <div class="space-y-4">
    <PageHeaderNav :title="t('home.bookCourt')" :home-to="localePath('/')" :back-to="localePath(`/clubs/${slug}`)" />
    <input v-model="date" type="date" class="w-full rounded-xl border border-black/10 px-3 py-2" />
    <div v-if="club" class="ios-card p-4 text-sm">
      <p class="font-bold">{{ t('booking.cancellationPolicy') }}</p>
      <p class="mt-1 text-brand-gray-600">{{ club.cancellationWindowHours }}h {{ t('booking.cancellationWindow') }} · {{ club.rescheduleWindowHours }}h {{ t('booking.rescheduleWindow') }}</p>
    </div>

    <div v-if="feedback" class="ios-card p-4 text-sm" :class="feedbackTone === 'success' ? 'text-brand-primary' : 'text-red-600'">
      {{ feedback }}
    </div>

    <div v-if="done" class="ios-card p-4 text-center">
      <p class="font-bold text-brand-primary">✓ {{ t('booking.successCourt') }}</p>
      <p class="mt-1 text-sm">{{ t('booking.payAtClub') }}</p>
    </div>

    <div v-else class="space-y-2">
      <div v-if="!slots?.length" class="ios-card space-y-2 p-4 text-center">
        <p class="font-bold">{{ t('booking.noSlots') }}</p>
        <button type="button" class="rounded-xl border px-4 py-3 text-sm font-bold" @click="joinWaitlist">
          {{ joiningWaitlist ? t('common.loading') : t('booking.joinWaitlist') }}
        </button>
      </div>
      <button
        v-for="s in slots"
        :key="s.id"
        type="button"
        class="ios-card w-full p-3 text-start"
        :class="selectedSlot === s.id ? 'ring-2 ring-brand-primary' : ''"
        @click="selectedSlot = s.id"
      >
        <p class="font-bold">{{ localizedField(s.court, 'nameFa', 'nameEn') }}</p>
        <p class="text-sm">{{ s.startTime }} – {{ s.endTime }} · {{ formatCurrency(s.price) }}</p>
      </button>
      <button v-if="slots?.length" type="button" class="btn-primary w-full" :disabled="!selectedSlot" @click="confirm">
        {{ t('booking.confirm') }}
      </button>
    </div>
  </div>
</template>
