<script setup lang="ts">
import {
  computeRatingFromWizard,
  getSkillAssessmentQuestionnaire,
  skillLevelPlayDescriptionFa,
} from '#shared/skillAssessment.ts'
import { skillLevelLabelFa } from '#shared/skillRating.ts'
import { savePendingGuestSkillAssessment } from '#shared/guestSkillAssessment.ts'

const props = defineProps<{
  sportSlug: string
  sportNameFa: string
  /** When logged in, pass catalog id so we can save server-side. */
  sportId?: string | null
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const { formatFaDigits } = useFormatters()
const { fetchErrorMessage } = useFetchError()
const { user } = useAuth()

const step = ref(0)
const choices = ref<(number | null)[]>([null, null, null, null, null, null])
const phase = ref<'questions' | 'result'>('questions')
const pending = ref(false)
const error = ref('')
const previewRating = ref<number | null>(null)
const previewLabel = ref('')
const previewDesc = ref('')
const serverSaved = ref(false)

const questions = computed(() => getSkillAssessmentQuestionnaire(props.sportSlug))
const currentQuestion = computed(() => questions.value[step.value])
const progressPct = computed(() => ((step.value + 1) / 6) * 100)
const canNext = computed(() => choices.value[step.value] != null)
const isLoggedIn = computed(() => Boolean(user.value))

function resetWizard() {
  step.value = 0
  phase.value = 'questions'
  choices.value = [null, null, null, null, null, null]
  pending.value = false
  error.value = ''
  previewRating.value = null
  previewLabel.value = ''
  previewDesc.value = ''
  serverSaved.value = false
}

function pickOption(index: number) {
  choices.value[step.value] = index
}

function back() {
  if (step.value > 0) step.value -= 1
}

function applyLocalPreview(picked: number[]) {
  const { rating } = computeRatingFromWizard(props.sportSlug, picked)
  previewRating.value = rating
  previewLabel.value = skillLevelLabelFa(rating)
  previewDesc.value = skillLevelPlayDescriptionFa(rating)
  phase.value = 'result'
}

async function submitAuthenticated(picked: number[]) {
  if (!props.sportId) {
    applyLocalPreview(picked)
    return
  }
  pending.value = true
  error.value = ''
  try {
    const data = await $fetch<{
      rating: number
      labelFa: string
      playDescriptionFa: string
    }>('/api/athlete/skill-ratings/assess', {
      method: 'POST',
      body: {
        sportId: props.sportId,
        answers: {
          wizard: {
            version: 2,
            sportSlug: props.sportSlug,
            choices: picked,
          },
        },
      },
    })
    previewRating.value = data.rating
    previewLabel.value = data.labelFa
    previewDesc.value = data.playDescriptionFa
    serverSaved.value = true
    phase.value = 'result'
  } catch (err) {
    error.value = fetchErrorMessage(err)
  } finally {
    pending.value = false
  }
}

function nextOrSubmit() {
  if (!canNext.value) return
  if (step.value < 5) {
    step.value += 1
    return
  }
  const picked = choices.value.map((v) => v ?? 0)
  if (isLoggedIn.value) {
    submitAuthenticated(picked)
  } else {
    applyLocalPreview(picked)
  }
}

function saveGuestAndLogin() {
  const picked = choices.value.map((v) => v ?? 0)
  const rating = previewRating.value ?? computeRatingFromWizard(props.sportSlug, picked).rating
  savePendingGuestSkillAssessment({
    sportSlug: props.sportSlug,
    choices: picked,
    rating,
    labelFa: previewLabel.value || skillLevelLabelFa(rating),
    playDescriptionFa: previewDesc.value || skillLevelPlayDescriptionFa(rating),
    savedAt: new Date().toISOString(),
  })
  navigateTo(localePath({
    path: '/login',
    query: { returnTo: '/athlete/open-match' },
  }))
}
</script>

<template>
  <div
    id="skill-assessment-wizard"
    class="border border-brand-gray-200 bg-white p-4 shadow-sm min-[431px]:p-5"
  >
    <div v-if="phase === 'questions'" class="space-y-4">
      <div class="space-y-1">
        <div class="h-1 w-full overflow-hidden bg-brand-gray-200">
          <div
            class="h-full bg-brand-primary transition-all duration-300"
            :style="{ width: `${progressPct}%` }"
          />
        </div>
        <p class="text-start text-xs font-bold text-brand-gray-500">
          {{ t('skillAssess.stepProgress', { current: formatFaDigits(String(step + 1)) }) }}
        </p>
      </div>

      <p class="text-start text-base font-bold text-brand-navy">
        {{ currentQuestion?.title }}
      </p>

      <ul class="space-y-2">
        <li v-for="(opt, idx) in currentQuestion?.options || []" :key="`${step}-${idx}`">
          <button
            type="button"
            class="w-full border p-3 text-start transition-colors"
            :class="choices[step] === idx
              ? 'border-brand-primary bg-brand-primary-soft'
              : 'border-brand-gray-200 bg-white hover:border-brand-gray-300'"
            @click="pickOption(idx)"
          >
            <span class="block text-sm font-bold text-brand-navy">{{ opt.label }}</span>
            <span class="mt-0.5 block text-xs text-brand-gray-500">{{ opt.description }}</span>
          </button>
        </li>
      </ul>

      <p v-if="error" role="alert" class="text-start text-sm text-brand-primary">
        {{ error }}
      </p>

      <div class="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          class="border border-brand-gray-200 px-4 py-2 text-sm font-bold text-brand-navy disabled:opacity-40"
          :disabled="step === 0 || pending"
          @click="back"
        >
          {{ t('common.back') }}
        </button>
        <button
          type="button"
          class="min-w-[8rem] flex-1 bg-brand-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          :disabled="!canNext || pending"
          @click="nextOrSubmit"
        >
          {{ pending ? t('common.loading') : (step < 5 ? t('skillAssess.next') : t('skillAssess.finish')) }}
        </button>
      </div>
    </div>

    <div v-else class="space-y-4 text-start">
      <p class="text-sm text-brand-gray-500">
        {{ sportNameFa }}
      </p>
      <div class="border border-brand-gray-200 bg-brand-gold-soft p-4">
        <p class="text-xs font-bold text-brand-gray-500">
          {{ t('skillAssess.yourLevel') }}
        </p>
        <p class="mt-1 text-3xl font-bold tabular-nums text-brand-navy">
          {{ formatFaDigits(String(previewRating ?? '')) }}
        </p>
        <p class="mt-1 text-lg font-bold text-brand-primary">
          {{ previewLabel }}
        </p>
        <p class="mt-2 text-sm leading-relaxed text-brand-navy">
          {{ previewDesc }}
        </p>
      </div>
      <p class="text-xs leading-relaxed text-brand-gray-500">
        {{ t('skillAssess.confidenceNote') }}
      </p>

      <div v-if="isLoggedIn && serverSaved" class="flex flex-col gap-2 sm:flex-row">
        <NuxtLink
          :to="localePath('/athlete')"
          class="bg-brand-primary px-4 py-2 text-center text-sm font-bold text-white"
        >
          {{ t('skillAssess.goAthlete') }}
        </NuxtLink>
        <NuxtLink
          :to="localePath('/athlete/open-match')"
          class="border border-brand-gray-200 px-4 py-2 text-center text-sm font-bold text-brand-navy"
        >
          {{ t('skillAssess.backToOpenMatch') }}
        </NuxtLink>
      </div>

      <div v-else-if="!isLoggedIn" class="flex flex-col gap-2">
        <button
          type="button"
          class="bg-brand-primary px-4 py-2 text-center text-sm font-bold text-white"
          @click="saveGuestAndLogin"
        >
          {{ t('skillAssess.guestSaveCta') }}
        </button>
        <button
          type="button"
          class="border border-brand-gray-200 px-4 py-2 text-sm font-bold text-brand-navy"
          @click="resetWizard"
        >
          {{ t('skillAssess.retake') }}
        </button>
      </div>

      <div v-else class="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          class="border border-brand-gray-200 px-4 py-2 text-sm font-bold text-brand-navy"
          @click="resetWizard"
        >
          {{ t('skillAssess.retake') }}
        </button>
      </div>
    </div>
  </div>
</template>