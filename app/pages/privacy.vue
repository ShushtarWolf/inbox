<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <div class="prose prose-sm mx-auto max-w-2xl py-8">
    <h1>{{ t('legal.privacyTitle') }}</h1>
    <p>{{ t('legal.privacyBody') }}</p>
  </div>
</template>
