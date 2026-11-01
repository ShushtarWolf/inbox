<script setup lang="ts">
const props = defineProps<{
  programId: string
  programPercent: number
  disabled?: boolean
  initialStatus?: string | null
}>()

const emit = defineEmits<{
  submitted: []
}>()

const { t } = useI18n()
const { formatNumber } = useFormatters()
const { fetchErrorMessage } = useFetchError()

const fullName = ref('')
const studentNumber = ref('')
useAsciiDigits(studentNumber)
const proofUrl = ref('')
const ownershipConfirmed = ref(false)
const submitting = ref(false)
const formError = ref('')
const success = ref(false)

const blocked = computed(() =>
  props.disabled
  || props.initialStatus === 'PENDING'
  || props.initialStatus === 'APPROVED'
  || success.value,
)

async function submit() {
  if (blocked.value || submitting.value) return
  formError.value = ''
  if (!ownershipConfirmed.value) {
    formError.value = t('studentVerify.errors.ownership')
    return
  }
  if (!fullName.value.trim()) {
    formError.value = t('studentVerify.errors.fullName')
    return
  }
  if (!studentNumber.value.trim()) {
    formError.value = t('studentVerify.errors.studentNumber')
    return
  }
  if (!proofUrl.value) {
    formError.value = t('studentVerify.errors.proof')
    return
  }

  submitting.value = true
  try {
    await $fetch('/api/discount-applications', {
      method: 'POST',
      body: {
        programId: props.programId,
        proofUrls: [proofUrl.value],
        fullName: fullName.value.trim(),
        studentNumber: studentNumber.value.trim(),
        ownershipConfirmed: true,
      },
    })
    success.value = true
    emit('submitted')
  }
  catch (err) {
    const msg = fetchErrorMessage(err, t('common.error'))
    const statusMessage = typeof err === 'object' && err && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    if (statusMessage === 'STUDENT_NUMBER_ALREADY_APPROVED') {
      formError.value = t('studentVerify.errors.duplicateStudentNumber')
    }
    else if (statusMessage === 'DISCOUNT_APPLICATION_RATE_LIMITED') {
      formError.value = t('studentVerify.errors.rateLimited')
    }
    else if (statusMessage === 'Application already pending') {
      formError.value = t('studentVerify.status.pending')
    }
    else {
      formError.value = msg
    }
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="venus-form-stack space-y-3 text-start" @submit.prevent="submit">
    <p class="text-xs text-brand-gray-600">
      {{ t('studentVerify.formIntro', { percent: formatNumber(programPercent) }) }}
    </p>

    <AppFormField :label="t('studentVerify.fullName')">
      <input
        v-model="fullName"
        class="neo-input"
        autocomplete="name"
        :disabled="blocked || submitting"
        :placeholder="t('studentVerify.fullNamePlaceholder')"
      >
    </AppFormField>

    <AppFormField :label="t('studentVerify.studentNumber')">
      <input
        v-model="studentNumber"
        class="neo-input tabular-nums"
        dir="ltr"
        inputmode="numeric"
        autocomplete="off"
        :disabled="blocked || submitting"
        :placeholder="t('studentVerify.studentNumberPlaceholder')"
      >
    </AppFormField>

    <fieldset :disabled="blocked || submitting" class="contents">
      <AppImageUpload
        :model-value="proofUrl"
        :label="t('studentVerify.cardImage')"
        @update:model-value="(url) => { proofUrl = url }"
      />
    </fieldset>
    <p class="text-xs text-brand-gray-600">{{ t('studentVerify.cardImageHint') }}</p>

    <label class="flex items-start gap-2 text-sm text-brand-navy">
      <input
        v-model="ownershipConfirmed"
        type="checkbox"
        class="mt-1 size-4 shrink-0 accent-brand-primary"
        :disabled="blocked || submitting"
      >
      <span>{{ t('studentVerify.ownershipConfirm') }}</span>
    </label>

    <p v-if="formError" class="venus-alert-error" role="alert">{{ formError }}</p>
    <p v-if="success || initialStatus === 'PENDING'" class="text-sm font-bold text-amber-800" role="status">
      {{ t('studentVerify.status.pending') }}
    </p>
    <p v-else-if="initialStatus === 'APPROVED'" class="text-sm font-bold text-emerald-800" role="status">
      {{ t('studentVerify.status.approved', { percent: formatNumber(programPercent) }) }}
    </p>
    <p v-else-if="initialStatus === 'REJECTED'" class="text-sm text-brand-primary" role="status">
      {{ t('studentVerify.status.rejected') }}
    </p>

    <button
      type="submit"
      class="canva-black-cta"
      :disabled="blocked || submitting || !ownershipConfirmed"
    >
      {{ submitting ? t('common.loading') : t('studentVerify.submit') }}
    </button>
  </form>
</template>
