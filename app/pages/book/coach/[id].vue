<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const id = route.params.id as string
const { user, fetch: fetchAuth } = useAuth()

const date = ref(new Date().toISOString().slice(0, 10))
const startTime = ref('')
const done = ref(false)
const joiningWaitlist = ref(false)
const feedback = ref('')
const feedbackTone = ref<'success' | 'error'>('success')

const { data: coach } = await useFetch(`/api/coaches/${id}`)
const { data: availability } = await useFetch(`/api/coaches/${id}/availability`, {
  query: computed(() => ({ date: date.value })),
})

async function confirm() {
  if (!user.value) return navigateTo(localePath('/login'))
  try {
    await $fetch('/api/bookings/coach', {
      method: 'POST',
      body: { coachId: id, date: date.value, startTime: startTime.value },
    })
    done.value = true
    feedbackTone.value = 'success'
    feedback.value = t('booking.successCoach')
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
        clubSlug: coach.value?.club?.slug,
        coachId: id,
        date: date.value,
        startTime: '18:00',
        endTime: '19:00',
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

watch(availability, () => {
  startTime.value = availability.value?.slots?.[0]?.startTime || ''
})

onMounted(() => fetchAuth())
</script>

<template>
  <div class="space-y-4">
    <PageHeaderNav :title="t('home.findCoach')" :home-to="localePath('/')" :back-to="localePath(`/coaches/${id}`)" />
    <input v-model="date" type="date" class="w-full rounded-xl border px-3 py-2" />
    <div v-if="coach" class="ios-card p-4 text-sm">
      <p class="font-bold">{{ t('booking.cancellationPolicy') }}</p>
      <p class="mt-1 text-brand-gray-600">{{ coach.club?.rescheduleWindowHours || 24 }}h {{ t('booking.rescheduleWindow') }}</p>
    </div>
    <div v-if="feedback" class="ios-card p-4 text-sm" :class="feedbackTone === 'success' ? 'text-brand-primary' : 'text-red-600'">
      {{ feedback }}
    </div>
    <select v-model="startTime" class="w-full rounded-xl border px-3 py-2">
      <option v-for="slot in availability?.slots || []" :key="slot.startTime" :value="slot.startTime">{{ slot.startTime }} - {{ slot.endTime }}</option>
    </select>
    <div v-if="done" class="ios-card p-4 text-center">
      <p class="font-bold text-brand-primary">✓ {{ t('booking.successCoach') }}</p>
      <p class="mt-1 text-sm">{{ t('booking.payAtClub') }}</p>
    </div>
    <div v-else class="space-y-2">
      <button v-if="availability?.slots?.length" type="button" class="btn-primary w-full" @click="confirm">{{ t('booking.confirm') }}</button>
      <button v-else type="button" class="w-full rounded-xl border px-4 py-3 text-sm font-bold" @click="joinWaitlist">
        {{ joiningWaitlist ? t('common.loading') : t('booking.joinWaitlist') }}
      </button>
    </div>
  </div>
</template>
