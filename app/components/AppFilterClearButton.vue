<script setup lang="ts">
defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  click: []
}>()

const { t } = useI18n()
</script>

<template>
  <button
    v-if="show"
    type="button"
    class="canva-session-filter-btn w-full"
    @click="emit('click')"
  >
    {{ t('owner.financeTable.clearAllFilters') }}
  </button>
</template>