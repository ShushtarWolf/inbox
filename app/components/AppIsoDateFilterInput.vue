<script setup lang="ts">
const model = defineModel<string>({ required: true })

const props = withDefaults(defineProps<{
  ariaLabel?: string
  inputClass?: string
  minDate?: string
  /** For AppFormField label `for` association. */
  id?: string
  /** Extra classes on the outer wrapper (e.g. `mt-1`). */
  wrapperClass?: string
  /** When true, wrapper gets `flex-1` for filter rows. */
  grow?: boolean
}>(), {
  inputClass: 'canva-finance-date',
  grow: true,
})

const { formatDate } = useFormatters()
const { t } = useI18n()
const { today } = useLocalDate()

const showPicker = ref(false)
const draft = ref('')

const effectiveMinDate = computed(() => {
  const raw = props.minDate
  return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ''
})

const displayLabel = computed(() => {
  if (!model.value) return t('owner.pickDate')
  return formatDate(model.value)
})

function openPicker() {
  draft.value = model.value || today()
  showPicker.value = true
}

function closePicker() {
  showPicker.value = false
}

function confirmPick() {
  if (effectiveMinDate.value && draft.value < effectiveMinDate.value) {
    draft.value = effectiveMinDate.value
  }
  model.value = draft.value
  closePicker()
}
</script>

<template>
  <span class="block min-w-0" :class="[grow ? 'flex-1' : '', wrapperClass]">
    <button
      :id="id"
      type="button"
      :class="[inputClass, 'tabular-nums w-full text-start', !model ? 'text-brand-gray-500' : '']"
      :aria-label="ariaLabel || t('owner.pickDate')"
      @click="openPicker"
    >
      {{ displayLabel }}
    </button>

    <AppModal
      :open="showPicker"
      patterned
      close-icon
      sheet
      :aria-label="ariaLabel || t('owner.pickDate')"
      max-width-class="canva-phone-shell canva-owner-date-modal max-w-sm"
      @close="closePicker"
    >
      <div class="canva-owner-date-body">
        <AppJalaliCalendar
          v-model="draft"
          variant="owner"
          :min-date="effectiveMinDate"
          @select="confirmPick"
        />
      </div>
    </AppModal>
  </span>
</template>