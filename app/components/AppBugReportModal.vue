<script setup lang="ts">
const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const { user } = useAuth()

const description = ref('')
const reporterEmail = ref('')
const screenshotUrl = ref('')
const submitting = ref(false)
const submitError = ref('')
const submitted = ref(false)

function resetForm() {
  description.value = ''
  reporterEmail.value = ''
  screenshotUrl.value = ''
  submitError.value = ''
  submitted.value = false
}

function close() {
  emit('close')
}

watch(() => props.open, (isOpen) => {
  if (!isOpen) resetForm()
})

async function submit() {
  submitError.value = ''
  const trimmed = description.value.trim()
  if (trimmed.length < 10) {
    submitError.value = t('bugReport.descriptionTooShort')
    return
  }

  submitting.value = true
  try {
    await $fetch('/api/bug-reports', {
      method: 'POST',
      body: {
        description: trimmed,
        screenshotUrl: screenshotUrl.value || undefined,
        pageUrl: window.location.href,
        userAgent: navigator.userAgent,
        reporterEmail: user.value ? undefined : reporterEmail.value.trim() || undefined,
      },
    })
    submitted.value = true
  } catch {
    submitError.value = t('common.error')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AppModal :open="open" :title="t('bugReport.title')" max-width-class="max-w-lg" @close="close">
    <div class="ios-card p-4 venus-form-stack sm:p-6">
      <template v-if="submitted">
        <p class="venus-alert-success text-sm">{{ t('bugReport.success') }}</p>
        <button type="button" class="btn-primary w-full" @click="close">{{ t('common.close') }}</button>
      </template>
      <template v-else>
        <p class="text-sm text-brand-gray-600">{{ t('bugReport.hint') }}</p>
        <AppFormField :label="t('bugReport.description')">
          <textarea
            v-model="description"
            class="neo-textarea min-h-28"
            :placeholder="t('bugReport.descriptionPlaceholder')"
            required
          />
        </AppFormField>
        <AppFormField v-if="!user" :label="t('bugReport.email')">
          <input
            v-model="reporterEmail"
            type="email"
            dir="ltr"
            class="neo-input"
            :placeholder="t('bugReport.emailPlaceholder')"
          />
        </AppFormField>
        <AppImageUpload
          v-model="screenshotUrl"
          :label="t('bugReport.screenshot')"
          guest
        />
        <p v-if="submitError" class="venus-alert-error">{{ submitError }}</p>
        <div class="flex gap-2">
          <button type="button" class="btn-primary flex-1" :disabled="submitting" @click="submit">
            {{ submitting ? t('common.loading') : t('bugReport.submit') }}
          </button>
          <button type="button" class="btn-secondary flex-1" :disabled="submitting" @click="close">
            {{ t('common.close') }}
          </button>
        </div>
      </template>
    </div>
  </AppModal>
</template>
