<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const { localizedField } = useLocalizedField()
const { formatCurrency } = useFormatters()
const { user } = useAuth()
const id = route.params.id as string

const selectedDays = ref<string[]>([])
const done = ref(false)
const feedback = ref('')
const feedbackTone = ref<'success' | 'error'>('success')

const { data: pkg, pending, error } = await useFetch(`/api/packages/${id}`)
const { pilotNoCoach } = usePilotFlags()

const packageBackTo = computed(() => {
  if (pilotNoCoach.value) return localePath('/clubs')
  if (pkg.value?.coach) return localePath(`/coaches/${pkg.value.coach.id}`)
  return localePath('/coaches')
})

watch(pkg, (value) => {
  if (value?.days?.length && !selectedDays.value.length) {
    selectedDays.value = [...value.days]
  }
}, { immediate: true })

function toggleDay(day: string) {
  if (selectedDays.value.includes(day)) {
    selectedDays.value = selectedDays.value.filter((item) => item !== day)
  } else {
    selectedDays.value = [...selectedDays.value, day]
  }
}

async function confirm() {
  if (!user.value) {
    return navigateTo(localePath({ path: '/login', query: { returnTo: route.fullPath } }))
  }
  feedback.value = ''
  try {
    await $fetch('/api/bookings/package', {
      method: 'POST',
      body: { packageId: id, days: selectedDays.value },
    })
    done.value = true
    feedbackTone.value = 'success'
    feedback.value = t('booking.packageConfirmed')
  } catch {
    feedbackTone.value = 'error'
    feedback.value = t('booking.packageFailed')
  }
}
</script>

<template>
  <AppAsyncState :pending="pending" :error="error" :empty="!pkg" skeleton-variant="default">
    <div v-if="pkg" class="tail-page-stack">
      <PageHeaderNav
        :title="pkg.title"
        :subtitle="localizedField(pkg.club, 'nameFa', 'nameEn')"
        :home-to="localePath('/')"
        :back-to="packageBackTo"
      />

      <div class="ios-card p-4 space-y-2">
        <p class="text-lg font-bold text-brand-primary">{{ formatCurrency(Math.max(0, pkg.price - (pkg.discount || 0))) }}</p>
        <p v-if="pkg.comment" class="text-sm text-brand-gray-600">{{ pkg.comment }}</p>
        <p class="text-sm">{{ t('booking.packageSpots', { count: pkg.spotsLeft }) }}</p>
        <p v-if="pkg.startDate" class="text-sm text-brand-gray-600">{{ pkg.startDate }} — {{ pkg.finishDate }}</p>
      </div>

      <section v-if="pkg.days?.length" class="ios-card p-4">
        <h2 class="mb-2 font-bold">{{ t('booking.packageDays') }}</h2>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="day in pkg.days"
            :key="day"
            type="button"
            class="neo-pill"
            :class="selectedDays.includes(day) ? 'neo-pill-active' : 'neo-pill-inactive'"
            @click="toggleDay(day)"
          >
            {{ day }}
          </button>
        </div>
      </section>

      <p v-if="feedback" :class="feedbackTone === 'success' ? 'text-green-700' : 'venus-alert-error'">{{ feedback }}</p>

      <button
        v-if="!done"
        type="button"
        class="btn-primary w-full"
        :disabled="pkg.isFull || (pkg.days?.length && !selectedDays.length)"
        @click="confirm"
      >
        {{ pkg.isFull ? t('booking.packageFull') : t('booking.packageConfirm') }}
      </button>
      <NuxtLink v-else :to="localePath('/athlete/bookings')" class="btn-primary block text-center">
        {{ t('nav.bookings') }}
      </NuxtLink>
    </div>
  </AppAsyncState>
</template>
