<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <div class="prose prose-sm mx-auto max-w-2xl py-8">
    <h1>{{ t('legal.termsTitle') }}</h1>
    <p>{{ t('legal.termsBody') }}</p>
  </div>
</template>
